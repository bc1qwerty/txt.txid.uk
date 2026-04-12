import { esc } from './markdown.mjs';

const CSS = `
:root{--fg:#111;--bg:#fff;--muted:#666;--rule:#ccc;--link:#0645ad;--visited:#551a8b}
@media (prefers-color-scheme:dark){:root{--fg:#e4e4e4;--bg:#111;--muted:#9a9a9a;--rule:#333;--link:#89b4fa;--visited:#b4a7d6}}
html{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--fg);background:var(--bg);line-height:1.6}
body{max-width:40em;margin:2em auto;padding:0 1em}
a{color:var(--link)}a:visited{color:var(--visited)}
h1,h2,h3,h4{line-height:1.25;margin-top:1.5em}
h1{font-size:1.75em}h2{font-size:1.4em}h3{font-size:1.15em}
hr{border:0;border-top:1px solid var(--rule);margin:2em 0}
pre{background:rgba(127,127,127,.12);padding:.75em;overflow-x:auto;font-size:.9em}
code{background:rgba(127,127,127,.12);padding:.1em .3em;font-size:.9em}
pre code{background:none;padding:0}
blockquote{border-left:3px solid var(--rule);margin:1em 0;padding-left:1em;color:var(--muted)}
table{border-collapse:collapse;margin:1em 0}
th,td{border:1px solid var(--rule);padding:.35em .6em;text-align:left}
ul,ol{padding-left:1.5em}
nav.top{border-bottom:1px solid var(--rule);padding-bottom:.75em;margin-bottom:1.5em;font-size:.9em}
nav.top a{margin-right:1em}
.meta{color:var(--muted);font-size:.9em;margin:.25em 0 1.5em}
.meta a{color:var(--muted)}
.posts{list-style:none;padding-left:0}
.posts li{margin-bottom:1em;padding-bottom:1em;border-bottom:1px solid var(--rule)}
.posts .title{font-size:1.1em;font-weight:600}
footer{margin-top:3em;padding-top:1em;border-top:1px solid var(--rule);color:var(--muted);font-size:.85em}
img{max-width:100%;height:auto}
.full-site-banner{font-size:.85em;color:var(--muted);padding:.5em .75em;margin-bottom:1.25em;border:1px solid var(--rule);border-radius:4px}
.full-site-banner a{color:var(--link)}
`.trim();

function nav() {
  return '<nav class="top"><a href="/">txt.txid.uk</a><a href="/news/">News</a><a href="/learn/">Learn</a></nav>';
}

function footer() {
  return `<footer><p>Text-only mirror of the txid.uk ecosystem. No CSS frameworks, no JavaScript, no tracking. See <a href="https://txid.uk">txid.uk</a> for the full experience.</p></footer>`;
}

export function fullSiteBanner(url, label = 'View on full site') {
  if (!url) return '';
  return `<p class="full-site-banner">Reading text-only. <a href="${esc(url)}">${esc(label)} →</a></p>`;
}

export function renderPage({ title, description, canonical, lang = 'en', body }) {
  const t = esc(title);
  const d = esc(description || '');
  const canonicalTag = canonical
    ? `<link rel="canonical" href="${esc(canonical)}">`
    : '';
  return `<!DOCTYPE html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
${d ? `<meta name="description" content="${d}">` : ''}
${canonicalTag}
<meta name="robots" content="noindex, follow">
<style>${CSS}</style>
</head>
<body>
${nav()}
${body}
${footer()}
</body>
</html>`;
}
