#!/usr/bin/env node
// txt.txid.uk builder — fetches both feeds and emits plain HTML into dist/.
// Zero external dependencies.

import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown, esc } from './markdown.mjs';
import { renderPage } from './template.mjs';

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
async function emit(relPath, html) {
  const full = join(DIST, relPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, html);
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

// ── News pages ──
async function buildNews(feed) {
  if (!feed) return { count: 0 };
  const posts = feed.posts || [];

  // Post list
  const listBody = `
<h1>News</h1>
<p class="meta">Text-only mirror of <a href="https://news.txid.uk">news.txid.uk</a>. ${posts.length} posts.</p>
<ul class="posts">
${posts
  .map(
    (p) => `<li>
<div class="title"><a href="/news/post/${esc(p.slug)}/">${esc(p.title)}</a></div>
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

  // Individual posts
  for (const p of posts) {
    const bodyHtml = renderMarkdown(p.content);
    const tagsHtml =
      p.tags && p.tags.length
        ? `<p class="meta">Tags: ${p.tags.map((t) => esc(t)).join(', ')}</p>`
        : '';
    const body = `
<h1>${esc(p.title)}</h1>
<p class="meta">${fmtDate(p.date)}${p.category ? ' · ' + esc(p.category) : ''}${p.author ? ' · by ' + esc(p.author) : ''}</p>
${p.summary ? `<p><em>${esc(p.summary)}</em></p><hr>` : ''}
${bodyHtml}
${tagsHtml}
<p class="meta">Read on the full site: <a href="${esc(p.canonicalUrl)}">${esc(p.canonicalUrl)}</a></p>`;

    await emit(
      `news/post/${p.slug}/index.html`,
      renderPage({
        title: `${p.title} — txt.txid.uk`,
        description: p.summary,
        canonical: p.canonicalUrl,
        lang: 'en',
        body,
      })
    );
  }

  return { count: posts.length };
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
<h1>${esc(section)} (${esc(lang)})</h1>
<p class="meta">${items.length} entries.</p>
<ul class="posts">
${items
  .map(
    (p) => `<li>
<div class="title"><a href="/learn/${lang}/${section}/${encodeURIComponent(p.slug)}/">${esc(p.title)}</a></div>
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
          })
        );
      }
    }
  }

  return { count: posts.length };
}

// ── Landing page ──
async function buildLanding(newsCount, learnCount) {
  const body = `
<h1>txt.txid.uk</h1>
<p>A text-only mirror of the <a href="https://txid.uk">txid.uk</a> ecosystem. Plain HTML. Minimal CSS. No JavaScript. No tracking.</p>
<p>Built for readers who prefer unstyled content, screen readers, text browsers (Lynx, w3m), reader mode, and low-bandwidth connections.</p>
<h2>Sources</h2>
<ul>
<li><a href="/news/">News</a> — ${newsCount} posts from <a href="https://news.txid.uk">news.txid.uk</a></li>
<li><a href="/learn/">Learn</a> — ${learnCount} entries from <a href="https://learn.txid.uk">learn.txid.uk</a></li>
</ul>
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
  const [newsRes, learnRes] = await Promise.all([
    buildNews(newsFeed),
    buildLearn(learnFeed),
  ]);

  await buildLanding(newsRes.count, learnRes.count);

  console.log(`Done. ${newsRes.count} news + ${learnRes.count} learn pages → ${DIST}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
