#!/usr/bin/env node
// Gopher builder for txt.txid.uk. Zero dependencies.
// Reads txt-feed.json (news + learn) and emits Gopher menus + text files
// under dist-gopher/. Upload target: /var/gopher/ on VPS (gophernicus root).

import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { markdownToGopherText } from './markdown-to-gophertext.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist-gopher');

const HOST = 'gopher.txid.uk';
const PORT = 70;

const LOCAL_NEWS_FEED = '/data/projects/news.txid.uk/public/txt-feed.json';
const LOCAL_LEARN_FEED = '/data/projects/learn.txid.uk/dist/txt-feed.json';

const NEWS_FEED_URL =
  process.env.NEWS_FEED_URL ||
  (existsSync(LOCAL_NEWS_FEED) ? LOCAL_NEWS_FEED : 'https://news.txid.uk/txt-feed.json');
const LEARN_FEED_URL =
  process.env.LEARN_FEED_URL ||
  (existsSync(LOCAL_LEARN_FEED) ? LOCAL_LEARN_FEED : 'https://learn.txid.uk/txt-feed.json');

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
    console.log(`  \u2713 ${label}: ${feed.posts?.length ?? 0} posts`);
    return feed;
  } catch (err) {
    console.warn(`  \u26a0 ${label} unavailable (${err.message})`);
    return null;
  }
}

async function emit(relPath, content) {
  const full = join(DIST, relPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

function gInfo(text) {
  return `i${text}\tfake\t(NULL)\t0`;
}
function gText(display, selector) {
  return `0${display}\t${selector}\t${HOST}\t${PORT}`;
}
function gDir(display, selector) {
  return `1${display}\t${selector}\t${HOST}\t${PORT}`;
}
function gUrl(display, url) {
  return `h${display}\tURL:${url}\t${HOST}\t${PORT}`;
}
function gmapEnd(lines) {
  return lines.join('\n') + '\n.\n';
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

function safeSlug(s) {
  return String(s).replace(/[^A-Za-z0-9._-]/g, '_');
}

function isDigest(p) {
  return p.section === 'digest';
}

function postText(p) {
  const body = markdownToGopherText(p.content || '');
  let doc = '';
  doc += p.title + '\n';
  doc += '='.repeat(Math.min(70, p.title.length)) + '\n\n';
  const meta = [fmtDate(p.date), p.category, p.author && `by ${p.author}`, p.lang].filter(Boolean).join(' | ');
  if (meta) doc += meta + '\n\n';
  if (p.summary) doc += p.summary + '\n\n';
  doc += body;
  if (p.tags && p.tags.length) doc += '\nTags: ' + p.tags.join(', ') + '\n';
  if (p.canonicalUrl) doc += '\nRead on full site: ' + p.canonicalUrl + '\n';
  return doc;
}

// -- News --
async function buildNews(feed) {
  if (!feed) return { count: 0, digests: 0 };
  const entries = feed.posts || [];
  const posts = entries.filter((p) => !isDigest(p));
  const digests = entries.filter(isDigest);
  const sortedPosts = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
  const sortedDigests = [...digests].sort((a, b) => new Date(b.date) - new Date(a.date));

  for (const p of entries) {
    const slug = safeSlug(p.slug);
    const rel = isDigest(p) ? `news/digest/${slug}.txt` : `news/post/${slug}.txt`;
    await emit(rel, postText(p));
  }

  const lines = [];
  lines.push(gInfo('=================================='));
  lines.push(gInfo('   News - txt.txid.uk (Gopher)'));
  lines.push(gInfo('=================================='));
  lines.push(gInfo(''));
  lines.push(gInfo(`${posts.length} posts + ${digests.length} daily digests`));
  lines.push(gInfo(''));
  if (sortedDigests.length) {
    lines.push(gInfo('--- Daily digests ---'));
    for (const p of sortedDigests) {
      lines.push(gText(`${fmtDate(p.date)}  ${p.title}`, `/news/digest/${safeSlug(p.slug)}.txt`));
    }
    lines.push(gInfo(''));
  }
  lines.push(gInfo('--- Articles ---'));
  for (const p of sortedPosts) {
    lines.push(gText(`${fmtDate(p.date)}  ${p.title}`, `/news/post/${safeSlug(p.slug)}.txt`));
  }
  lines.push(gInfo(''));
  lines.push(gDir('.. Back to root', '/'));
  await emit('news/gophermap', gmapEnd(lines));
  return { count: posts.length, digests: digests.length };
}

// -- Learn --
async function buildLearn(feed) {
  if (!feed) return { count: 0 };
  const posts = feed.posts || [];

  const byLang = new Map();
  for (const p of posts) {
    if (!byLang.has(p.lang)) byLang.set(p.lang, new Map());
    const bySection = byLang.get(p.lang);
    if (!bySection.has(p.section)) bySection.set(p.section, []);
    bySection.get(p.section).push(p);
  }

  // write all post .txt files
  for (const p of posts) {
    const rel = `learn/${p.lang}/${p.section}/${safeSlug(p.slug)}.txt`;
    await emit(rel, postText(p));
  }

  // top learn menu
  const top = [];
  top.push(gInfo('=================================='));
  top.push(gInfo('   Learn - txt.txid.uk (Gopher)'));
  top.push(gInfo('=================================='));
  top.push(gInfo(''));
  top.push(gInfo(`${posts.length} posts across ${byLang.size} languages`));
  top.push(gInfo(''));
  for (const [lang, sections] of byLang) {
    const langTotal = Array.from(sections.values()).reduce((a, b) => a + b.length, 0);
    top.push(gDir(`${lang} (${langTotal} posts)`, `/learn/${lang}/`));
  }
  top.push(gInfo(''));
  top.push(gDir('.. Back to root', '/'));
  await emit('learn/gophermap', gmapEnd(top));

  for (const [lang, sections] of byLang) {
    const langMenu = [];
    langMenu.push(gInfo(`Learn - ${lang}`));
    langMenu.push(gInfo('=================================='));
    langMenu.push(gInfo(''));
    for (const [section, items] of sections) {
      langMenu.push(gDir(`${section} (${items.length})`, `/learn/${lang}/${section}/`));
    }
    langMenu.push(gInfo(''));
    langMenu.push(gDir('.. Back to Learn', '/learn/'));
    await emit(`learn/${lang}/gophermap`, gmapEnd(langMenu));

    for (const [section, items] of sections) {
      const secMenu = [];
      secMenu.push(gInfo(`${section} - ${lang}`));
      secMenu.push(gInfo('=================================='));
      secMenu.push(gInfo(''));
      secMenu.push(gInfo(`${items.length} entries`));
      secMenu.push(gInfo(''));
      const sorted = [...items].sort((a, b) => String(a.title).localeCompare(String(b.title)));
      for (const p of sorted) {
        secMenu.push(gText(p.title, `/learn/${lang}/${section}/${safeSlug(p.slug)}.txt`));
      }
      secMenu.push(gInfo(''));
      secMenu.push(gDir(`.. Back to ${lang}`, `/learn/${lang}/`));
      await emit(`learn/${lang}/${section}/gophermap`, gmapEnd(secMenu));
    }
  }
  return { count: posts.length };
}

async function buildRoot(newsStats, learnStats) {
  const lines = [];
  lines.push(gInfo('======================================'));
  lines.push(gInfo('     txt.txid.uk - Gopher mirror'));
  lines.push(gInfo('======================================'));
  lines.push(gInfo(''));
  lines.push(gInfo('A text-only mirror of the txid.uk ecosystem'));
  lines.push(gInfo('reachable over the Gopher protocol (RFC 1436).'));
  lines.push(gInfo(''));
  lines.push(gInfo('Gopher is the 1991 hypertext system that HTTP'));
  lines.push(gInfo('replaced. No HTML, no CSS, no JavaScript.'));
  lines.push(gInfo('Just menus and text files.'));
  lines.push(gInfo(''));
  lines.push(gDir(`News  (${newsStats.count} posts + ${newsStats.digests} digests)`, '/news/'));
  lines.push(gDir(`Learn (${learnStats.count} entries, en/ko/ja)`, '/learn/'));
  lines.push(gInfo(''));
  lines.push(gInfo('--- Other access methods ---'));
  lines.push(gUrl('Clearnet HTTPS (HTML)', 'https://txt.txid.uk/'));
  lines.push(gUrl('Gemini protocol', 'gemini://gemini.txid.uk/'));
  lines.push(gUrl('Tor hidden service (v3)', 'http://3gtfnkxog3gymzodli5bzzr5uwahklap3jldaqohowldtdlhwfbcdeid.onion/'));
  lines.push(gUrl('IPFS (content-addressed)', 'https://ipfs.io/ipns/k51qzi5uqu5djaf06lbcq4kmw5hzrhkhrvpuqvpynq0jlgeic8kq1mzmt0mhb2/'));
  lines.push(gInfo(''));
  lines.push(gInfo(`Last built: ${new Date().toISOString()}`));
  await emit('gophermap', gmapEnd(lines));
}

async function main() {
  console.log('txt.txid.uk gopher builder');
  console.log('  NEWS_FEED_URL =', NEWS_FEED_URL);
  console.log('  LEARN_FEED_URL =', LEARN_FEED_URL);

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  console.log('Fetching feeds...');
  const [newsFeed, learnFeed] = await Promise.all([
    fetchFeedSafe(NEWS_FEED_URL, 'news'),
    fetchFeedSafe(LEARN_FEED_URL, 'learn'),
  ]);

  console.log('Generating gopher menus + text files...');
  const [newsStats, learnStats] = await Promise.all([
    buildNews(newsFeed),
    buildLearn(learnFeed),
  ]);
  await buildRoot(newsStats, learnStats);

  console.log(
    `Done. ${newsStats.count} news + ${newsStats.digests} digests + ${learnStats.count} learn plain-text files -> ${DIST}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
