#!/usr/bin/env node
// Gemini/Gemtext builder for txt.txid.uk. Zero dependencies.
// Reads txt-feed.json (news + learn) and emits .gmi files under dist-gemini/.
// Upload target: /var/lib/molly-brown/ on the Gemini host (Oracle VPS).

import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { markdownToGemtext } from './markdown-to-gemtext.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist-gemini');

const LOCAL_NEWS_FEED = '/data/projects/news.txid.uk/public/txt-feed.json';
const LOCAL_LEARN_FEED = '/data/projects/learn.txid.uk/dist/txt-feed.json';

const NEWS_FEED_URL =
  process.env.NEWS_FEED_URL ||
  (existsSync(LOCAL_NEWS_FEED) ? LOCAL_NEWS_FEED : 'https://news.txid.uk/txt-feed.json');
const LEARN_FEED_URL =
  process.env.LEARN_FEED_URL ||
  (existsSync(LOCAL_LEARN_FEED) ? LOCAL_LEARN_FEED : 'https://learn.txid.uk/txt-feed.json');

const SITE_URL = 'gemini://gemini.txid.uk';
const CLEARNET_URL = 'https://txt.txid.uk';

async function fetchFeed(url) {
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
    console.warn(`  ⚠ ${label} unavailable (${err.message}) — skipping`);
    return null;
  }
}

async function emit(relPath, content) {
  const full = join(DIST, relPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

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

function isDigest(p) {
  return p.section === 'digest';
}

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildAtomFeed(posts) {
  const updated = posts[0]?.date
    ? new Date(posts[0].date).toISOString()
    : new Date().toISOString();
  const entries = posts
    .slice(0, 30)
    .map((p) => {
      const url = `${SITE_URL}${newsPath(p)}`;
      const date = p.date ? new Date(p.date).toISOString() : updated;
      const summary = p.summary || p.title;
      return `  <entry>
    <title>${escapeXml(p.title)}</title>
    <link href="${escapeXml(url)}" rel="alternate" />
    <id>${escapeXml(url)}</id>
    <updated>${date}</updated>
    <published>${date}</published>
    <summary>${escapeXml(summary)}</summary>
  </entry>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>txt.txid.uk news (Gemini mirror)</title>
  <link href="${SITE_URL}/news/" rel="alternate" />
  <link href="${SITE_URL}/news/atom.xml" rel="self" />
  <id>${SITE_URL}/news/</id>
  <updated>${updated}</updated>
  <author><name>bc1qwerty</name></author>
${entries}
</feed>
`;
}

function newsPath(p) {
  return isDigest(p) ? `/news/digest/${p.slug}.gmi` : `/news/post/${p.slug}.gmi`;
}

function learnPath(p) {
  return `/learn/${p.lang}/${p.section}/${encodeURIComponent(p.slug)}.gmi`;
}

// ── News pages ──
async function buildNews(feed) {
  if (!feed) return { count: 0, digests: 0 };
  const allEntries = feed.posts || [];
  const posts = allEntries.filter((p) => !isDigest(p));
  const digests = allEntries.filter((p) => isDigest(p));

  // News index
  let list = '# News\n\n';
  list += `Text-only Gemini mirror of news.txid.uk. ${posts.length} posts`;
  if (digests.length) list += ` + ${digests.length} daily digests`;
  list += '.\n\n';
  list += `=> ${CLEARNET_URL}/news/ View on clearnet (HTML)\n`;
  list += `=> atom.xml Atom feed (for aggregators)\n\n`;

  if (digests.length) {
    list += '## Daily digests\n\n';
    for (const p of digests) {
      list += `=> digest/${p.slug}.gmi ${fmtDate(p.date)} — ${p.title}\n`;
    }
    list += '\n';
  }

  list += '## Articles\n\n';
  for (const p of posts) {
    const date = fmtDate(p.date);
    list += `=> post/${p.slug}.gmi ${date} — ${p.title}\n`;
  }
  list += '\n=> / Home\n';
  await emit('news/index.gmi', list);

  // Atom feed for CAPCOM / Spacewalk aggregators
  const sortedAll = [...allEntries].sort((a, b) => new Date(b.date) - new Date(a.date));
  await emit('news/atom.xml', buildAtomFeed(sortedAll));

  // robots.txt — let Gemini crawlers (Kennedy etc.) freely index us
  await emit('robots.txt', 'User-agent: *\nAllow: /\n');

  // Individual posts
  for (const p of allEntries) {
    const body = markdownToGemtext(p.content || '');
    const tags = p.tags && p.tags.length ? p.tags.join(', ') : '';
    let doc = `# ${p.title}\n\n`;
    doc += `${fmtDate(p.date)}`;
    if (p.category) doc += ` · ${p.category}`;
    if (p.author) doc += ` · by ${p.author}`;
    doc += '\n\n';
    if (p.summary) doc += `${p.summary}\n\n`;
    doc += body;
    if (tags) doc += `\n\nTags: ${tags}\n`;
    doc += `\n=> ${p.canonicalUrl} Read on full site (HTML)\n`;
    doc += `=> ../ News index\n`;
    doc += `=> / Home\n`;

    const rel = isDigest(p)
      ? `news/digest/${p.slug}.gmi`
      : `news/post/${p.slug}.gmi`;
    await emit(rel, doc);
  }

  return { count: posts.length, digests: digests.length };
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

  // Learn top index
  let top = '# Learn\n\n';
  top += `Text-only Gemini mirror of learn.txid.uk. ${posts.length} posts across ${byLang.size} languages.\n\n`;
  top += `=> ${CLEARNET_URL}/learn/ View on clearnet (HTML)\n\n`;
  for (const [lang] of byLang) {
    top += `=> /learn/${lang}/ ${lang}\n`;
  }
  top += '\n=> / Home\n';
  await emit('learn/index.gmi', top);

  for (const [lang, sections] of byLang) {
    // Per-language index
    let langIdx = `# Learn — ${lang}\n\n`;
    for (const [section, items] of sections) {
      langIdx += `=> /learn/${lang}/${section}/ ${section} (${items.length})\n`;
    }
    langIdx += '\n=> /learn/ Learn index\n';
    await emit(`learn/${lang}/index.gmi`, langIdx);

    for (const [section, items] of sections) {
      // Section index
      let secIdx = `# ${section} (${lang})\n\n`;
      secIdx += `${items.length} entries.\n\n`;
      for (const p of items) {
        secIdx += `=> /learn/${lang}/${section}/${encodeURIComponent(p.slug)}.gmi ${p.title}\n`;
      }
      secIdx += `\n=> /learn/${lang}/ ${lang} index\n`;
      secIdx += `=> /learn/ Learn index\n`;
      await emit(`learn/${lang}/${section}/index.gmi`, secIdx);

      // Individual posts
      for (const p of items) {
        const body = markdownToGemtext(p.content || '');
        let doc = `# ${p.title}\n\n`;
        doc += `${fmtDate(p.date)} · ${p.section} · ${p.lang}\n\n`;
        if (p.summary) doc += `${p.summary}\n\n`;
        doc += body;
        doc += `\n=> ${p.canonicalUrl} Read on full site (HTML)\n`;
        doc += `=> /learn/${p.lang}/${p.section}/ Back to ${p.section}\n`;
        doc += `=> /learn/ Learn index\n`;
        await emit(`learn/${p.lang}/${p.section}/${encodeURIComponent(p.slug)}.gmi`, doc);
      }
    }
  }

  return { count: posts.length };
}

// ── Landing page ──
async function buildLanding(newsFeed, learnFeed) {
  const newsCount = (newsFeed && newsFeed.posts && newsFeed.posts.filter(p => !isDigest(p)).length) || 0;
  const digestCount = (newsFeed && newsFeed.posts && newsFeed.posts.filter(isDigest).length) || 0;
  const learnCount = (learnFeed && learnFeed.posts && learnFeed.posts.length) || 0;

  let doc = '# txt.txid.uk\n\n';
  doc += 'A text-only mirror of the txid.uk ecosystem, reachable via the Gemini protocol.\n\n';
  doc += 'Gemini is an internet protocol between Gopher and HTTP. No HTML, no CSS, no JavaScript, no cookies, no tracking. Just content.\n\n';
  doc += '## Sections\n\n';
  doc += `=> /news/ News — ${newsCount} posts`;
  if (digestCount) doc += ` + ${digestCount} digests`;
  doc += '\n';
  doc += `=> /news/atom.xml News Atom feed\n`;
  doc += `=> /learn/ Learn — ${learnCount} entries (en, ko, ja)\n\n`;
  doc += '## Other access methods\n\n';
  doc += `=> https://txt.txid.uk/ Clearnet text-only mirror (HTML)\n`;
  doc += `=> http://3gtfnkxog3gymzodli5bzzr5uwahklap3jldaqohowldtdlhwfbcdeid.onion/ Tor hidden service (v3 onion)\n`;
  doc += `=> gopher://gopher.txid.uk/ Gopher protocol (port 70)\n`;
  doc += `=> https://txid.uk/ Full-featured txid.uk ecosystem\n\n`;
  doc += '## About\n\n';
  doc += 'Part of the txid.uk ecosystem. Brutalist by design.\n\n';
  doc += `Rebuilt automatically whenever news.txid.uk or learn.txid.uk redeploys.\n`;
  doc += `Last built: ${new Date().toISOString()}\n\n`;
  doc += '=> https://github.com/bc1qwerty/txt.txid.uk Source code\n';

  await emit('index.gmi', doc);
}

async function main() {
  console.log('txt.txid.uk gemini builder');
  console.log('  NEWS_FEED_URL =', NEWS_FEED_URL);
  console.log('  LEARN_FEED_URL =', LEARN_FEED_URL);

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  console.log('Fetching feeds...');
  const [newsFeed, learnFeed] = await Promise.all([
    fetchFeedSafe(NEWS_FEED_URL, 'news'),
    fetchFeedSafe(LEARN_FEED_URL, 'learn'),
  ]);

  console.log('Generating gemtext...');
  const [newsRes, learnRes] = await Promise.all([
    buildNews(newsFeed),
    buildLearn(learnFeed),
  ]);

  await buildLanding(newsFeed, learnFeed);

  console.log(
    `Done. ${newsRes.count} news + ${newsRes.digests} digests + ${learnRes.count} learn gemtext files -> ${DIST}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
