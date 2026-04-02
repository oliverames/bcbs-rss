import test from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";

import {
  absolutizeHtmlFragment,
  buildPublicAssetUrl,
  buildRss,
  extractMaxPageFromPager,
  parseArticle,
  parseListingPage,
} from "../src/index.js";

test("extractMaxPageFromPager returns the largest pager index", () => {
  const $ = cheerio.load(`
    <nav class="pager">
      <a href="?page=0">1</a>
      <a href="?page=4">5</a>
      <a href="?page=25">Last</a>
    </nav>
  `);

  assert.equal(extractMaxPageFromPager($), 25);
});

test("parseListingPage extracts article previews", () => {
  const html = `
    <div class="view-content">
      <div class="views-row">
        <article class="node--type-blog">
          <div class="cell large-8">
            <div class="blog-post--date"><time datetime="2026-03-04T12:00:00Z">Mar 4, 2026</time></div>
            <h3><a href="/health-community/blog/listing/example-post">Example Post</a></h3>
            <p>Example summary.</p>
            <div class="blog-post--category">Community</div>
          </div>
        </article>
      </div>
    </div>
    <nav class="pager"><a href="?page=12">13</a></nav>
  `;

  const result = parseListingPage(html);

  assert.equal(result.maxPage, 12);
  assert.deepEqual(result.previews, [
    {
      title: "Example Post",
      link: "https://www.bluecrossvt.org/health-community/blog/listing/example-post",
      description: "Example summary.",
      pubDate: "2026-03-04T12:00:00Z",
      category: "Community",
    },
  ]);
});

test("absolutizeHtmlFragment converts relative urls", () => {
  const html = absolutizeHtmlFragment(
    '<p><a href="/foo">Read more</a><img src="/image.jpg" srcset="/a.jpg 1x, /b.jpg 2x"></p>',
    "https://www.bluecrossvt.org/health-community/blog/listing/example-post",
  );

  assert.match(html, /https:\/\/www\.bluecrossvt\.org\/foo/);
  assert.match(html, /https:\/\/www\.bluecrossvt\.org\/image\.jpg/);
  assert.match(html, /https:\/\/www\.bluecrossvt\.org\/a\.jpg 1x/);
});

test("buildPublicAssetUrl appends assets under the site url", () => {
  assert.equal(
    buildPublicAssetUrl(
      "https://oliverames.github.io/bcbs-rss",
      "feed-logo.jpg",
    ),
    "https://oliverames.github.io/bcbs-rss/feed-logo.jpg",
  );
  assert.equal(
    buildPublicAssetUrl(
      "https://oliverames.github.io/bcbs-rss/",
      "/feed-logo.jpg",
    ),
    "https://oliverames.github.io/bcbs-rss/feed-logo.jpg",
  );
});

test("parseArticle builds full article data", () => {
  const article = parseArticle(
    `
      <html>
        <head>
          <link rel="canonical" href="https://www.bluecrossvt.org/health-community/blog/listing/example-post">
          <meta name="description" content="Meta description">
          <meta property="og:image" content="/hero.jpg">
          <meta property="og:image:alt" content="Hero image">
        </head>
        <body>
          <h1>Example Post</h1>
          <div class="hero--date"><time datetime="2026-03-04T12:00:00Z"></time></div>
          <div class="hero--category"><a href="/category">Community</a></div>
          <div class="blog-post--topic"><a href="/topic">Company News</a></div>
          <section class="wysiwyg-block">
            <div class="wysiwyg">
              <div class="blog-post--summary"><p>Summary paragraph.</p></div>
              <p><a href="/details">Details</a></p>
            </div>
          </section>
        </body>
      </html>
    `,
    {
      title: "Fallback",
      link: "https://www.bluecrossvt.org/fallback",
      description: "Fallback description",
      pubDate: "2026-03-01T12:00:00Z",
      category: "Fallback",
    },
  );

  assert.equal(article.title, "Example Post");
  assert.equal(
    article.link,
    "https://www.bluecrossvt.org/health-community/blog/listing/example-post",
  );
  assert.equal(article.description, "Summary paragraph.");
  assert.deepEqual(article.categories, ["Community", "Company News"]);
  assert.match(article.contentHtml, /https:\/\/www\.bluecrossvt\.org\/hero\.jpg/);
  assert.match(
    article.contentHtml,
    /https:\/\/www\.bluecrossvt\.org\/details/,
  );
});

test("buildRss emits content:encoded items", () => {
  const rss = buildRss([
    {
      title: "Example Post",
      link: "https://www.bluecrossvt.org/example-post",
      description: "Summary",
      pubDate: "2026-03-04T12:00:00Z",
      categories: ["Community"],
      contentHtml: "<p>Body</p>",
    },
  ]);

  assert.match(rss, /<rss version="2.0"/);
  assert.match(rss, /<title>Example Post<\/title>/);
  assert.match(rss, /<content:encoded><!\[CDATA\[/);
});
