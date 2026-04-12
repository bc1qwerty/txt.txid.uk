#!/usr/bin/env node
// Post-deploy smoke test. Verifies key endpoints return HTTP 200
// after a Cloudflare Pages deployment. Exits non-zero on failure
// so deploy scripts can catch broken deployments before notifying.

const SITE = 'https://txt.txid.uk';

const URLS = [
  '/',
  '/news/',
  '/learn/',
  '/feed.xml',
  '/sitemap.xml',
  '/robots.txt',
];

const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 2500;

async function checkWithRetry(path) {
  const url = `${SITE}${path}`;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (res.ok) {
        return { url, status: res.status, ok: true, attempts: attempt };
      }
      if (attempt === MAX_ATTEMPTS) {
        return { url, status: res.status, ok: false, attempts: attempt };
      }
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        return { url, status: `error: ${err.message}`, ok: false, attempts: attempt };
      }
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
  return { url, status: 'unreachable', ok: false, attempts: MAX_ATTEMPTS };
}

(async () => {
  console.log('[health-check] verifying txt.txid.uk endpoints...');
  // Give CF edge a moment to propagate the fresh deploy
  await new Promise((r) => setTimeout(r, 2000));

  const results = await Promise.all(URLS.map((p) => checkWithRetry(p)));
  let failed = 0;
  for (const r of results) {
    const mark = r.ok ? '✓' : '✗';
    const attempts = r.attempts > 1 ? ` (${r.attempts} attempts)` : '';
    console.log(`  ${mark} ${r.status} ${r.url}${attempts}`);
    if (!r.ok) failed++;
  }
  if (failed > 0) {
    console.error(`[health-check] FAILED: ${failed}/${URLS.length} endpoints not healthy`);
    process.exit(1);
  }
  console.log(`[health-check] all ${URLS.length} endpoints healthy`);
})();
