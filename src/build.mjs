#!/usr/bin/env node
// txt.txid.uk builder — fetches both feeds and emits plain HTML into dist/.
// Zero external dependencies.

import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown, esc } from './markdown.mjs';
import { renderPage, fullSiteBanner } from './template.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist');

// Local file paths — used when txt is built on the same machine as the origin
// sites (always fresher than live URLs since those depend on deploy propagation).
const LOCAL_NEWS_FEED = '/data/projects/news.txid.uk/public/txt-feed.json';
const LOCAL_LEARN_FEED = '/data/projects/learn.txid.uk/dist/txt-feed.json';

const NEWS_FEED_URL =
  process.env.NEWS_FEED_URL ||
  (existsSync(LOCAL_NEWS_FEED) ? LOCAL_NEWS_FEED : 'https://news.txid.uk/txt-feed.json');
const LEARN_FEED_URL =
  process.env.LEARN_FEED_URL ||
  (existsSync(LOCAL_LEARN_FEED) ? LOCAL_LEARN_FEED : 'https://learn.txid.uk/txt-feed.json');

const SITE_URL = 'https://txt.txid.uk';

// ── Fetch helper (supports http(s):// and file://) ──
async function fetchFeed(url) {
  if (url.startsWith('file://')) {
    const p = fileURLToPath(url);
    const raw = await readFile(p, 'utf8');
    return JSON.parse(raw);
  }
  if (url.startsWith('/')) {
    const raw = await readFile(url, 'utf8');
    return JSON.parse(raw);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

async function fetchFeedSafe(url, label) {
  try {
    const feed = await fetchFeed(url);
    console.log(`  ✓ ${label}: ${feed.posts?.length ?? 0} posts`);
    return feed;
  } catch (err) {
    console.warn(`  ⚠ ${label} unavailable (${err.message}) — skipping section`);
    return null;
  }
}

// ── File writer ──
async function emit(relPath, content) {
  const full = join(DIST, relPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

// ── Format helpers ──
function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function toRssDate(iso) {
  if (!iso) return new Date().toUTCString();
  const d = new Date(iso);
  if (isNaN(d.getTime())) return new Date().toUTCString();
  return d.toUTCString();
}

function newsPostPath(p) {
  if (p.section === 'digest') return `/news/digest/${p.slug}/`;
  return `/news/post/${p.slug}/`;
}

function isDigestPost(p) {
  return p.section === 'digest';
}

function tagSlug(tag) {
  return encodeURIComponent(String(tag).toLowerCase().trim());
}

function tagPath(tag) {
  return `/news/tag/${tagSlug(tag)}/`;
}

function learnPostPath(p) {
  return `/learn/${p.lang}/${p.section}/${encodeURIComponent(p.slug)}/`;
}

// ── News pages ──
async function buildNews(feed) {
  if (!feed) return { count: 0, digests: 0 };
  const allEntries = feed.posts || [];
  const posts = allEntries.filter((p) => !isDigestPost(p));
  const digests = allEntries.filter((p) => isDigestPost(p));

  // Post list
  const listBody = `
${fullSiteBanner('https://news.txid.uk', 'View news.txid.uk')}
<h1>News</h1>
<p class="meta">Text-only mirror of <a href="https://news.txid.uk">news.txid.uk</a>. ${posts.length} posts${digests.length ? ` + ${digests.length} daily digests` : ''}.</p>
${digests.length ? `<h2>Daily digests</h2>
<ul class="posts">
${digests
  .map(
    (p) => `<li>
<div class="title"><a href="${newsPostPath(p)}">${esc(p.title)}</a></div>
<div class="meta">${fmtDate(p.date)} · digest</div>
</li>`
  )
  .join('\n')}
</ul>
<h2>Articles</h2>` : ''}
<ul class="posts">
${posts
  .map(
    (p) => `<li>
<div class="title"><a href="${newsPostPath(p)}">${esc(p.title)}</a></div>
<div class="meta">${fmtDate(p.date)}${p.category ? ' · ' + esc(p.category) : ''}${p.summary ? ' — ' + esc(p.summary) : ''}</div>
</li>`
  )
  .join('\n')}
</ul>`;

  await emit(
    'news/index.html',
    renderPage({
      title: 'News — txt.txid.uk',
      description: 'Text-only mirror of news.txid.uk',
      canonical: 'https://news.txid.uk',
      body: listBody,
    })
  );

  // Individual posts and digests
  for (const p of allEntries) {
    const bodyHtml = renderMarkdown(p.content);
    const tagsHtml =
      p.tags && p.tags.length
        ? `<p class="meta">Tags: ${p.tags
            .map((t) => `<a href="${tagPath(t)}">${esc(t)}</a>`)
            .join(', ')}</p>`
        : '';
    const lastModStr =
      p.lastModified && fmtDate(p.lastModified) !== fmtDate(p.date)
        ? ` · updated ${fmtDate(p.lastModified)}`
        : '';
    const body = `
${fullSiteBanner(p.canonicalUrl)}
<h1>${esc(p.title)}</h1>
<p class="meta">${fmtDate(p.date)}${lastModStr}${p.category ? ' · ' + esc(p.category) : ''}${p.author ? ' · by ' + esc(p.author) : ''}</p>
${p.summary ? `<p><em>${esc(p.summary)}</em></p><hr>` : ''}
${bodyHtml}
${tagsHtml}
<p class="meta">Read on the full site: <a href="${esc(p.canonicalUrl)}">${esc(p.canonicalUrl)}</a></p>`;

    const relPath = isDigestPost(p)
      ? `news/digest/${p.slug}/index.html`
      : `news/post/${p.slug}/index.html`;

    await emit(
      relPath,
      renderPage({
        title: `${p.title} — txt.txid.uk`,
        description: p.summary,
        canonical: p.canonicalUrl,
        lang: 'en',
        body,
        ogType: 'article',
      })
    );
  }

  return { count: posts.length, digests: digests.length };
}

// ── News tag pages ──
async function buildNewsTags(feed) {
  if (!feed) return { count: 0 };
  const posts = feed.posts || [];

  // Collect tag -> posts map (skip digests — they don't use tags meaningfully)
  const tagMap = new Map();
  for (const p of posts) {
    if (isDigestPost(p)) continue;
    for (const tag of p.tags || []) {
      const key = String(tag).toLowerCase().trim();
      if (!key) continue;
      if (!tagMap.has(key)) tagMap.set(key, { display: tag, posts: [] });
      tagMap.get(key).posts.push(p);
    }
  }

  // Tag index page — all tags with post counts
  const sortedTags = [...tagMap.entries()].sort(
    ([a], [b]) => tagMap.get(b).posts.length - tagMap.get(a).posts.length || a.localeCompare(b)
  );

  const indexBody = `
${fullSiteBanner('https://news.txid.uk', 'View news.txid.uk')}
<h1>News tags</h1>
<p class="meta">${tagMap.size} unique tags across ${posts.length} posts.</p>
<ul>
${sortedTags
  .map(
    ([key, { display, posts: items }]) =>
      `<li><a href="${tagPath(display)}">${esc(display)}</a> (${items.length})</li>`
  )
  .join('\n')}
</ul>`;

  await emit(
    'news/tag/index.html',
    renderPage({
      title: 'News tags — txt.txid.uk',
      description: 'Browse news posts by tag',
      canonical: 'https://news.txid.uk',
      body: indexBody,
    })
  );

  // Per-tag pages
  for (const [, { display, posts: items }] of tagMap) {
    const tagBody = `
${fullSiteBanner('https://news.txid.uk', 'View news.txid.uk')}
<h1>Tag: ${esc(display)}</h1>
<p class="meta">${items.length} post${items.length === 1 ? '' : 's'}. <a href="/news/tag/">← all tags</a></p>
<ul class="posts">
${items
  .map(
    (p) => `<li>
<div class="title"><a href="${newsPostPath(p)}">${esc(p.title)}</a></div>
<div class="meta">${fmtDate(p.date)}${p.category ? ' · ' + esc(p.category) : ''}${p.summary ? ' — ' + esc(p.summary) : ''}</div>
</li>`
  )
  .join('\n')}
</ul>`;

    await emit(
      `news/tag/${tagSlug(display)}/index.html`,
      renderPage({
        title: `${display} — news tag — txt.txid.uk`,
        description: `News posts tagged ${display}`,
        canonical: 'https://news.txid.uk',
        body: tagBody,
      })
    );
  }

  return { count: tagMap.size };
}

// ── Learn pages ──
async function buildLearn(feed) {
  if (!feed) return { count: 0 };
  const posts = feed.posts || [];

  // Group by lang → section
  const byLang = new Map();
  for (const p of posts) {
    if (!byLang.has(p.lang)) byLang.set(p.lang, new Map());
    const bySection = byLang.get(p.lang);
    if (!bySection.has(p.section)) bySection.set(p.section, []);
    bySection.get(p.section).push(p);
  }

  // Top-level learn index
  const langSections = [];
  for (const [lang, sections] of byLang) {
    const sectionLinks = [];
    for (const [section, items] of sections) {
      sectionLinks.push(
        `<li><a href="/learn/${lang}/${section}/">${esc(section)}</a> (${items.length})</li>`
      );
    }
    langSections.push(
      `<h2>${esc(lang)}</h2><ul>${sectionLinks.join('')}</ul>`
    );
  }

  const learnIndexBody = `
${fullSiteBanner('https://learn.txid.uk', 'View learn.txid.uk')}
<h1>Learn</h1>
<p class="meta">Text-only mirror of <a href="https://learn.txid.uk">learn.txid.uk</a>. ${posts.length} posts across ${byLang.size} languages.</p>
${langSections.join('\n')}`;

  await emit(
    'learn/index.html',
    renderPage({
      title: 'Learn — txt.txid.uk',
      description: 'Text-only mirror of learn.txid.uk',
      canonical: 'https://learn.txid.uk',
      body: learnIndexBody,
    })
  );

  // Section list pages and individual posts
  for (const [lang, sections] of byLang) {
    for (const [section, items] of sections) {
      // Section list
      const sectionBody = `
${fullSiteBanner(`https://learn.txid.uk/${lang}/${section}/`, 'View on learn.txid.uk')}
<h1>${esc(section)} (${esc(lang)})</h1>
<p class="meta">${items.length} entries.</p>
<ul class="posts">
${items
  .map(
    (p) => `<li>
<div class="title"><a href="${learnPostPath(p)}">${esc(p.title)}</a></div>
${p.summary ? `<div class="meta">${esc(p.summary)}</div>` : ''}
</li>`
  )
  .join('\n')}
</ul>`;

      await emit(
        `learn/${lang}/${section}/index.html`,
        renderPage({
          title: `${section} (${lang}) — txt.txid.uk`,
          canonical: `https://learn.txid.uk/${lang}/${section}/`,
          lang,
          body: sectionBody,
        })
      );

      // Individual posts
      for (const p of items) {
        const bodyHtml = renderMarkdown(p.content);
        const body = `
${fullSiteBanner(p.canonicalUrl)}
<h1>${esc(p.title)}</h1>
<p class="meta">${fmtDate(p.date)}${p.section ? ' · ' + esc(p.section) : ''} · ${esc(p.lang)}</p>
${p.summary ? `<p><em>${esc(p.summary)}</em></p><hr>` : ''}
${bodyHtml}
<p class="meta">Read on the full site: <a href="${esc(p.canonicalUrl)}">${esc(p.canonicalUrl)}</a></p>`;

        await emit(
          `learn/${lang}/${section}/${encodeURIComponent(p.slug)}/index.html`,
          renderPage({
            title: `${p.title} — txt.txid.uk`,
            description: p.summary,
            canonical: p.canonicalUrl,
            lang,
            body,
            ogType: 'article',
          })
        );
      }
    }
  }

  return { count: posts.length };
}

// ── Landing page (with latest posts preview) ──
async function buildLanding(newsFeed, learnFeed) {
  const newsPosts = (newsFeed && newsFeed.posts) || [];
  const learnPosts = (learnFeed && learnFeed.posts) || [];

  const newsPreview = newsPosts
    .slice(0, 10)
    .map(
      (p) => `<li>
<div class="title"><a href="${newsPostPath(p)}">${esc(p.title)}</a></div>
<div class="meta">${fmtDate(p.date)}${p.category ? ' · ' + esc(p.category) : ''}${p.summary ? ' — ' + esc(p.summary) : ''}</div>
</li>`
    )
    .join('\n');

  const learnPreview = learnPosts
    .slice(0, 10)
    .map(
      (p) => `<li>
<div class="title"><a href="${learnPostPath(p)}">${esc(p.title)}</a></div>
<div class="meta">${esc(p.lang)} · ${esc(p.section)}${p.summary ? ' · ' + esc(p.summary) : ''}</div>
</li>`
    )
    .join('\n');

  const body = `
<h1>txt.txid.uk</h1>
<p>A text-only mirror of the <a href="https://txid.uk">txid.uk</a> ecosystem. Plain HTML. Minimal CSS. No JavaScript. No tracking.</p>
<p>Built for readers who prefer unstyled content, screen readers, text browsers (Lynx, w3m), reader mode, and low-bandwidth connections.</p>

<h2>Latest News <a href="/news/">→ all ${newsPosts.length}</a></h2>
<ul class="posts">
${newsPreview}
</ul>

<h2>Latest from Learn <a href="/learn/">→ all ${learnPosts.length}</a></h2>
<ul class="posts">
${learnPreview}
</ul>

<h2>Feeds</h2>
<ul>
<li><a href="/feed.xml">RSS feed</a> — combined news and learn, latest 50 items</li>
</ul>

<h2>Censorship-resistant access</h2>
<p>Also available as a Tor hidden service for readers in restricted environments:</p>
<pre><code>http://3gtfnkxog3gymzodli5bzzr5uwahklap3jldaqohowldtdlhwfbcdeid.onion/</code></pre>
<p class="meta">Open this URL in <a href="https://www.torproject.org/download/">Tor Browser</a>. The onion service mirrors the same content, JavaScript-free and tracker-free like the clearnet version. No CF Pages, no third-party CDN in the path — direct connection through the Tor network to a self-hosted reverse proxy.</p>

<h2>About this mirror</h2>
<p>Every page here has a <code>&lt;link rel="canonical"&gt;</code> pointing back to the original. Search engines should index the originals; this mirror is a companion, not a replacement.</p>
<p>Rebuilds automatically whenever either source site redeploys.</p>
<p class="meta">Last built: ${new Date().toISOString()}</p>`;

  await emit(
    'index.html',
    renderPage({
      title: 'txt.txid.uk — text-only mirror',
      description: 'Text-only mirror of the txid.uk ecosystem',
      canonical: SITE_URL,
      body,
    })
  );
}

// ── RSS feed ──
function rssItem(p, txtPath) {
  const fullUrl = `${SITE_URL}${txtPath}`;
  return `
    <item>
      <title>${esc(p.title)}</title>
      <link>${fullUrl}</link>
      <guid isPermaLink="true">${fullUrl}</guid>
      <pubDate>${toRssDate(p.date)}</pubDate>
      <description>${esc(p.summary || '')}</description>${p.category ? `\n      <category>${esc(p.category)}</category>` : ''}
    </item>`;
}

async function buildFeed(newsFeed, learnFeed) {
  const combined = [];
  if (newsFeed) {
    for (const p of (newsFeed.posts || []).slice(0, 30)) {
      combined.push({ post: p, path: newsPostPath(p) });
    }
  }
  if (learnFeed) {
    for (const p of (learnFeed.posts || []).slice(0, 20)) {
      combined.push({ post: p, path: learnPostPath(p) });
    }
  }
  combined.sort((a, b) => {
    const da = a.post.date ? new Date(a.post.date).getTime() : 0;
    const db = b.post.date ? new Date(b.post.date).getTime() : 0;
    return db - da;
  });

  const items = combined.map(({ post, path }) => rssItem(post, path)).join('');
  const now = new Date().toUTCString();
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>txt.txid.uk — Text-only mirror</title>
    <link>${SITE_URL}</link>
    <description>Text-only mirror of the txid.uk ecosystem. News, learn, and more.</description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
    <generator>txt.txid.uk builder</generator>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>${items}
  </channel>
</rss>`;

  await emit('feed.xml', rss);
}

// ── robots.txt ──
async function buildRobots() {
  const body = `User-agent: *
Disallow:

Sitemap: ${SITE_URL}/sitemap.xml
`;
  await emit('robots.txt', body);
}

// ── sitemap.xml ──
async function buildSitemap(newsFeed, learnFeed) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [{ loc: `${SITE_URL}/`, lastmod: today }];

  if (newsFeed) {
    urls.push({ loc: `${SITE_URL}/news/`, lastmod: today });
    for (const p of newsFeed.posts || []) {
      urls.push({
        loc: `${SITE_URL}${newsPostPath(p)}`,
        lastmod: fmtDate(p.lastModified || p.date),
      });
    }
  }

  if (learnFeed) {
    urls.push({ loc: `${SITE_URL}/learn/`, lastmod: today });
    const sectionSet = new Set();
    for (const p of learnFeed.posts || []) {
      sectionSet.add(`${p.lang}/${p.section}`);
      urls.push({
        loc: `${SITE_URL}${learnPostPath(p)}`,
        lastmod: fmtDate(p.lastModified || p.date),
      });
    }
    for (const key of sectionSet) {
      urls.push({ loc: `${SITE_URL}/learn/${key}/`, lastmod: today });
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`
  )
  .join('\n')}
</urlset>`;

  await emit('sitemap.xml', xml);
}

// ── 404 page ──
async function build404() {
  const body = `
<h1>Page not found</h1>
<p>The page you're looking for doesn't exist on this text-only mirror.</p>
<ul>
<li><a href="/">Return to the landing page</a></li>
<li><a href="/news/">Browse news</a></li>
<li><a href="/learn/">Browse learn</a></li>
</ul>
<p class="meta">If you expected a specific post here, it may exist on <a href="https://txid.uk">txid.uk</a> but not yet be mirrored. This mirror only includes published content from news.txid.uk and learn.txid.uk.</p>`;

  await emit(
    '404.html',
    renderPage({
      title: 'Not found — txt.txid.uk',
      description: 'Page not found',
      body,
    })
  );
}

// ── Main ──
async function main() {
  console.log('txt.txid.uk builder');
  console.log('  NEWS_FEED_URL =', NEWS_FEED_URL);
  console.log('  LEARN_FEED_URL =', LEARN_FEED_URL);

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  console.log('Fetching feeds...');
  const [newsFeed, learnFeed] = await Promise.all([
    fetchFeedSafe(NEWS_FEED_URL, 'news'),
    fetchFeedSafe(LEARN_FEED_URL, 'learn'),
  ]);

  console.log('Generating pages...');
  const [newsRes, learnRes, tagRes] = await Promise.all([
    buildNews(newsFeed),
    buildLearn(learnFeed),
    buildNewsTags(newsFeed),
  ]);

  await buildLanding(newsFeed, learnFeed);
  await buildFeed(newsFeed, learnFeed);
  await buildRobots();
  await buildSitemap(newsFeed, learnFeed);
  await build404();

  console.log(
    `Done. ${newsRes.count} news + ${newsRes.digests} digests + ${learnRes.count} learn + ${tagRes.count} tag pages, plus feed.xml, sitemap.xml, robots.txt, 404.html -> ${DIST}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
