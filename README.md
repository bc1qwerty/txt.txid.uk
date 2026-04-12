# txt.txid.uk

Text-only mirror of the txid.uk ecosystem. Plain HTML, minimal CSS (~1KB), zero JavaScript. No framework, no build tool dependencies.

## Sources

- `https://news.txid.uk/txt-feed.json` — news posts
- `https://learn.txid.uk/txt-feed.json` — learn articles, guides, books, etc.

## Philosophy

Inspired by text.npr.org, legiblenews.com, and the brutalist web design ethos. The browser's default styles are already accessible and reasonable — get out of the way of the content.

## Build

```bash
npm run build     # writes dist/
npm run deploy    # build + wrangler pages deploy
```

Builds fetch both feeds over HTTPS and generate static HTML. No database, no runtime.

## Sync

`txt.txid.uk` rebuilds whenever the origin sites redeploy — the `deploy` scripts in news.txid.uk and learn.txid.uk trigger a Cloudflare Pages deploy hook, which runs this build. All edits (new posts, content fixes, slug changes) propagate automatically.

## Canonical URLs

Every page includes `<link rel="canonical">` pointing back to the original site. Search engines index the original; txt is a companion mirror for readers who prefer plain HTML.
