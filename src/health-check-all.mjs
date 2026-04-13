#!/usr/bin/env node
// Multi-protocol smoke test for the txt.txid.uk mirror ecosystem.
// Verifies all 5 access paths are live and returning content.
//
// Protocols covered:
//   1. HTTPS (Cloudflare Pages)
//   2. Gemini (gemini.txid.uk port 1965, TLS)
//   3. Gopher (158.180.91.252 port 70, plain TCP)  [DNS pending]
//   4. IPFS  (public gateway ipfs.io, IPNS-resolved)
//   5. Tor   (onion via local SOCKS5 if available — optional)
//
// Zero deps, uses Node built-ins only.

import { connect as tlsConnect } from 'node:tls';
import { createConnection } from 'node:net';

const SITE = 'https://txt.txid.uk';
const GEMINI_HOST = 'gemini.txid.uk';
const GEMINI_PORT = 1965;
const GOPHER_HOST = '158.180.91.252'; // VPS IP until DNS A for gopher.txid.uk lands
const GOPHER_PORT = 70;
const IPNS = 'k51qzi5uqu5djaf06lbcq4kmw5hzrhkhrvpuqvpynq0jlgeic8kq1mzmt0mhb2';
const ONION = '3gtfnkxog3gymzodli5bzzr5uwahklap3jldaqohowldtdlhwfbcdeid.onion';

// ── HTTPS ──
async function checkHttps(path = '/') {
  try {
    const res = await fetch(SITE + path, { redirect: 'follow' });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: `error: ${err.message}` };
  }
}

// ── Gemini ──
function checkGemini(path = '/') {
  return new Promise((resolve) => {
    const socket = tlsConnect({
      host: GEMINI_HOST,
      port: GEMINI_PORT,
      servername: GEMINI_HOST,
      rejectUnauthorized: false,
      timeout: 8000,
    });
    let data = '';
    let settled = false;
    const done = (result) => { if (!settled) { settled = true; socket.destroy(); resolve(result); } };
    socket.on('secureConnect', () => {
      socket.write(`gemini://${GEMINI_HOST}${path}\r\n`);
    });
    socket.on('data', (chunk) => {
      data += chunk.toString('utf8');
      if (data.includes('\n')) {
        const header = data.split('\n')[0].trim();
        const code = parseInt(header.split(' ')[0], 10);
        done({ ok: code >= 20 && code < 30, status: header });
      }
    });
    socket.on('timeout', () => done({ ok: false, status: 'timeout' }));
    socket.on('error', (err) => done({ ok: false, status: `error: ${err.message}` }));
    socket.on('end', () => done({ ok: false, status: 'closed' }));
  });
}

// ── Gopher ──
function checkGopher(selector = '/') {
  return new Promise((resolve) => {
    const socket = createConnection({ host: GOPHER_HOST, port: GOPHER_PORT, timeout: 8000 });
    let data = '';
    let settled = false;
    const done = (result) => { if (!settled) { settled = true; socket.destroy(); resolve(result); } };
    socket.on('connect', () => {
      socket.write(`${selector}\r\n`);
    });
    socket.on('data', (chunk) => {
      data += chunk.toString('utf8');
      if (data.length > 200) {
        // Got content, that's enough
        done({ ok: data.length > 0, status: `got ${data.length} bytes` });
      }
    });
    socket.on('end', () => done({ ok: data.length > 0, status: `got ${data.length} bytes` }));
    socket.on('timeout', () => done({ ok: false, status: 'timeout' }));
    socket.on('error', (err) => done({ ok: false, status: `error: ${err.message}` }));
  });
}

// ── IPFS (via public gateway) ──
async function checkIpfs(path = '/') {
  try {
    const url = `https://ipfs.io/ipns/${IPNS}${path}`;
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: `error: ${err.message}` };
  }
}

// ── Tor (optional — needs local SOCKS5 on 9050) ──
async function checkTor() {
  try {
    // Node's fetch doesn't natively support SOCKS5. We just TCP probe localhost:9050
    // and skip if not running.
    const probe = await new Promise((resolve) => {
      const s = createConnection({ host: '127.0.0.1', port: 9050, timeout: 1500 });
      s.on('connect', () => { s.destroy(); resolve(true); });
      s.on('error', () => resolve(false));
      s.on('timeout', () => { s.destroy(); resolve(false); });
    });
    if (!probe) return { ok: null, status: 'skipped (no local tor)' };
    return { ok: null, status: 'tor running — manual curl verification recommended' };
  } catch {
    return { ok: null, status: 'skipped' };
  }
}

(async () => {
  console.log('[5-protocol health] checking all txt.txid.uk access paths...');
  const checks = [
    { name: 'HTTPS clearnet    ', fn: () => checkHttps('/news/') },
    { name: 'Gemini news       ', fn: () => checkGemini('/news/') },
    { name: 'Gemini learn/ko   ', fn: () => checkGemini('/learn/ko/') },
    { name: 'Gopher root       ', fn: () => checkGopher('/') },
    { name: 'Gopher /news/     ', fn: () => checkGopher('/news/') },
    { name: 'IPFS HTML         ', fn: () => checkIpfs('/news/') },
    { name: 'IPFS gemtext      ', fn: () => checkIpfs('/gemini/index.gmi') },
    { name: 'Tor SOCKS5 probe  ', fn: () => checkTor() },
  ];

  let failed = 0;
  let skipped = 0;
  for (const c of checks) {
    const r = await c.fn();
    if (r.ok === true) {
      console.log(`  \u2713  ${c.name} ${r.status}`);
    } else if (r.ok === null) {
      console.log(`  \u2022  ${c.name} ${r.status}`);
      skipped++;
    } else {
      console.log(`  \u2717  ${c.name} ${r.status}`);
      failed++;
    }
  }
  const total = checks.length - skipped;
  console.log(`[5-protocol health] ${total - failed}/${total} checks passed` + (skipped ? ` (${skipped} skipped)` : ''));
  if (failed > 0) process.exit(1);
})();
