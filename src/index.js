import path from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import * as cheerio from "cheerio";

const SITE_ORIGIN = "https://www.bluecrossvt.org";
const BLOG_LISTING_PATH = "/health-community/blog/listing";
const BLOG_LISTING_URL = new URL(BLOG_LISTING_PATH, SITE_ORIGIN).toString();
const OUTPUT_PATH = process.env.RSS_OUTPUT_PATH
  ? path.resolve(process.cwd(), process.env.RSS_OUTPUT_PATH)
  : path.resolve(process.cwd(), "site", "feed.rss");
const REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.RSS_TIMEOUT_MS ?? "15000",
  10,
);
const CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.RSS_CONCURRENCY ?? "5", 10),
);
const FEED_URL = process.env.FEED_URL?.trim() || "";
const USER_AGENT = "bcbs-rss-feed-generator/1.0";

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapCdata(value) {
  return `<![CDATA[${String(value).replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function resolveUrl(url, baseUrl = SITE_ORIGIN) {
  if (!url) {
    return "";
  }

  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function absolutizeSrcset(value, baseUrl) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [rawUrl, descriptor] = entry.split(/\s+/, 2);
      const absoluteUrl = resolveUrl(rawUrl, baseUrl);
      return descriptor ? `${absoluteUrl} ${descriptor}` : absoluteUrl;
    })
    .join(", ");
}

function absolutizeHtmlFragment(html, baseUrl) {
  if (!html) {
    return "";
  }

  const $ = cheerio.load(html, null, false);

  $("script, style").remove();

  $("[href]").each((_, element) => {
    const current = $(element).attr("href");
    if (current) {
      $(element).attr("href", resolveUrl(current, baseUrl));
    }
  });

  for (const attribute of ["src", "data-src", "poster"]) {
    $(`[${attribute}]`).each((_, element) => {
      const current = $(element).attr(attribute);
      if (current) {
        $(element).attr(attribute, resolveUrl(current, baseUrl));
      }
    });
  }

  for (const attribute of ["srcset", "data-srcset"]) {
    $(`[${attribute}]`).each((_, element) => {
      const current = $(element).attr(attribute);
      if (current) {
        $(element).attr(attribute, absolutizeSrcset(current, baseUrl));
      }
    });
  }

  return $.root().html()?.trim() ?? "";
}

function extractMaxPageFromPager($) {
  let maxPage = 0;

  $("nav.pager a[href*='page=']").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) {
      return;
    }

    try {
      const page = Number.parseInt(
        new URL(resolveUrl(href, BLOG_LISTING_URL)).searchParams.get("page") ??
          "0",
        10,
      );

      if (!Number.isNaN(page)) {
        maxPage = Math.max(maxPage, page);
      }
    } catch {
      // Ignore malformed pager links and keep the largest valid page index.
    }
  });

  return maxPage;
}

async function fetchHtml(url) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} while fetching ${url}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;

      if (attempt < 3) {
        await sleep(500 * attempt);
      }
    }
  }

  throw lastError;
}

function parseListingPage(html) {
  const $ = cheerio.load(html);
  const maxPage = extractMaxPageFromPager($);
  const previews = $(".view-content .views-row article.node--type-blog")
    .map((_, article) => {
      const $article = $(article);
      const titleLink = $article.find("h3 a").first();
      const relativeLink = titleLink.attr("href");
      const title = cleanText(titleLink.text());

      if (!relativeLink || !title) {
        return null;
      }

      return {
        title,
        link: resolveUrl(relativeLink, SITE_ORIGIN),
        description:
          cleanText(
            $article.find(".cell.large-8 > p").first().text() ||
              $article.find("p").first().text(),
          ) || "",
        pubDate:
          $article.find(".blog-post--date time").attr("datetime")?.trim() || "",
        category:
          cleanText($article.find(".blog-post--category").first().text()) || "",
      };
    })
    .get()
    .filter(Boolean);

  return { maxPage, previews };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );

  await Promise.all(workers);
  return results;
}

async function fetchAllPreviews() {
  const firstPageHtml = await fetchHtml(BLOG_LISTING_URL);
  const firstPage = parseListingPage(firstPageHtml);
  const pageIndexes = Array.from(
    { length: firstPage.maxPage },
    (_, index) => index + 1,
  );

  const otherPages = await mapWithConcurrency(
    pageIndexes,
    CONCURRENCY,
    async (pageIndex) => {
      const html = await fetchHtml(`${BLOG_LISTING_URL}?page=${pageIndex}`);
      return parseListingPage(html).previews;
    },
  );

  return [firstPage.previews, ...otherPages].flat();
}

function parseArticle(html, fallback) {
  const $ = cheerio.load(html);
  const canonical =
    $("link[rel='canonical']").attr("href")?.trim() || fallback.link;
  const title = cleanText($("h1").first().text()) || fallback.title;
  const description =
    cleanText($(".blog-post--summary").first().text()) ||
    $("meta[name='description']").attr("content")?.trim() ||
    fallback.description;
  const pubDate =
    $(".hero--date time").attr("datetime")?.trim() || fallback.pubDate;
  const categories = [
    cleanText($(".hero--category").first().text()),
    ...$(".blog-post--topic a")
      .map((_, element) => cleanText($(element).text()))
      .get(),
  ].filter(Boolean);
  const uniqueCategories = [...new Set(categories)];
  const heroImage = resolveUrl(
    $("meta[property='og:image']").attr("content")?.trim() || "",
    canonical,
  );
  const heroImageAlt =
    $("meta[property='og:image:alt']").attr("content")?.trim() || title;
  const bodyHtml = absolutizeHtmlFragment(
    $(".wysiwyg-block .wysiwyg").first().html() || "",
    canonical,
  );
  const heroImageHtml = heroImage
    ? `<p><img src="${escapeXml(heroImage)}" alt="${escapeXml(heroImageAlt)}"></p>`
    : "";
  const contentHtml =
    heroImageHtml +
    (bodyHtml || `<p>${escapeXml(description || fallback.description)}</p>`);

  return {
    title,
    link: canonical,
    description: description || fallback.description,
    pubDate,
    categories: uniqueCategories.length
      ? uniqueCategories
      : [fallback.category].filter(Boolean),
    contentHtml,
  };
}

function dedupeByLink(items) {
  const seen = new Set();

  return items.filter((item) => {
    if (seen.has(item.link)) {
      return false;
    }

    seen.add(item.link);
    return true;
  });
}

function compareByDateDescending(left, right) {
  return new Date(right.pubDate).getTime() - new Date(left.pubDate).getTime();
}

function buildRss(items) {
  const channelDescription =
    "Full-text RSS feed for the Be Well VT Blog from Blue Cross Blue Shield of Vermont.";
  const atomLink = FEED_URL
    ? `\n    <atom:link href="${escapeXml(
        FEED_URL,
      )}" rel="self" type="application/rss+xml" />`
    : "";

  const itemXml = items
    .map((item) => {
      const categoriesXml = item.categories
        .map((category) => `\n      <category>${escapeXml(category)}</category>`)
        .join("");

      return `  <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
      <pubDate>${new Date(item.pubDate).toUTCString()}</pubDate>${categoriesXml}
      <description>${wrapCdata(item.description)}</description>
      <content:encoded>${wrapCdata(item.contentHtml)}</content:encoded>
  </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Be Well VT Blog | Blue Cross Blue Shield of Vermont</title>
    <link>${escapeXml(BLOG_LISTING_URL)}</link>
    <description>${escapeXml(channelDescription)}</description>${atomLink}
    <language>en-US</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${itemXml}
  </channel>
</rss>
`;
}

async function generateFeed() {
  const previews = dedupeByLink(await fetchAllPreviews());
  const articles = await mapWithConcurrency(
    previews,
    CONCURRENCY,
    async (preview) => {
      const html = await fetchHtml(preview.link);
      return parseArticle(html, preview);
    },
  );

  const items = dedupeByLink(articles).sort(compareByDateDescending);
  const xml = buildRss(items);

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, xml, "utf8");

  return {
    outputPath: OUTPUT_PATH,
    itemCount: items.length,
  };
}

async function main() {
  const result = await generateFeed();
  console.log(
    `Generated ${result.itemCount} items at ${path.relative(process.cwd(), result.outputPath) || result.outputPath}`,
  );
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export {
  absolutizeHtmlFragment,
  buildRss,
  cleanText,
  extractMaxPageFromPager,
  generateFeed,
  parseArticle,
  parseListingPage,
  resolveUrl,
  wrapCdata,
};
