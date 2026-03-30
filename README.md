# BCBS Vermont RSS Feed

This project generates a full-text RSS feed for the Blue Cross Blue Shield of Vermont Be Well VT blog and publishes it as a small static GitHub Pages site.

## What it does

- Crawls every page of the blog listing archive.
- Fetches each article page for title, date, categories, summary, hero image, and full HTML content.
- Writes a standards-friendly `site/feed.rss` file for GitHub Pages publishing.

## Usage

```bash
npm install
npm run generate
```

The generated feed is written to `site/feed.rss`.

## Optional environment variables

- `RSS_OUTPUT_PATH`: custom output path for the generated RSS file.
- `RSS_CONCURRENCY`: number of concurrent fetches to use while crawling.
- `RSS_TIMEOUT_MS`: request timeout in milliseconds.
- `FEED_URL`: public URL for the published feed. When set, the feed includes an Atom self-link.

Example:

```bash
FEED_URL="https://example.com/feed.rss" npm run generate
```

## Automation

A GitHub Actions workflow is included at `.github/workflows/refresh-feed.yml`. Once this repo is pushed to GitHub, it will publish the `site/` directory to GitHub Pages on pushes to `main`, on manual runs, and on a weekly refresh schedule.
