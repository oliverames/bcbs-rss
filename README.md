<h1 align="center">BCBS VT RSS</h1>

<p align="center">
  <strong>Full-text RSS feed for the Blue Cross Blue Shield of Vermont Be Well VT blog, auto-published to GitHub Pages</strong>
</p>

<p align="center">
  <code>RSS 2.0</code> &bull;
  <code>GitHub Pages</code> &bull;
  <code>weekly refresh</code>
</p>

---

The Be Well VT blog has no RSS feed. This project crawls every page of the archive, fetches each article's full content (title, date, categories, hero image, and body HTML), and produces a standards-compliant RSS 2.0 feed published automatically to GitHub Pages — making the blog subscribable from any feed reader or automatable with RSS-aware tooling.

## Why This Exists

BCBS Vermont's blog covers benefits updates, wellness content, and community stories — useful signal if you work in the healthcare or marketing space. Without an RSS feed, tracking it requires remembering to check the site manually. This project fixes that: a weekly GitHub Actions schedule keeps the feed current, and the full-text output means you get the complete article in your reader, not just a teaser.

## Quick Start

```bash
npm install
npm run generate
```

The generated feed is written to `site/feed.rss`. Serve `site/` locally to verify, or push to GitHub and enable Pages on the `site/` directory.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RSS_OUTPUT_PATH` | `site/feed.rss` | Custom output path for the generated file |
| `RSS_CONCURRENCY` | — | Number of concurrent fetches while crawling |
| `RSS_TIMEOUT_MS` | — | Request timeout in milliseconds |
| `FEED_URL` | — | Public URL for the feed (enables Atom self-link) |
| `SITE_URL` | — | Public base URL (enables channel artwork via `site/feed-logo.jpg`) |

```bash
FEED_URL="https://oliverames.github.io/bcbs-rss/feed.rss" npm run generate
```

## Automation

A GitHub Actions workflow at `.github/workflows/refresh-feed.yml` publishes `site/` to GitHub Pages on pushes to `main`, manual runs, and a weekly refresh schedule. Once the repo is live and Pages is enabled, the feed stays current without manual intervention.
