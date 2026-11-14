// 빌드는 옆 디렉토리에 짓고 끝에서 바꿔 끼운다. 이름에 pid 를 넣는다 — 고정 이름이면 news·learn 배포가 겹칠 때
// 한쪽이 다른 쪽의 반쯤 찬 디렉토리를 dist 로 올릴 수 있다.
import { readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export const buildDirFor = (final, pid = process.pid) => `${final}.build.${pid}`;

/**
 * 죽은 빌드가 남긴 디렉토리를 치운다(살아 있는 pid 의 것은 둔다). 옛 고정 이름(`.build`)도 같이.
 * 교체 중에 죽으면 `.old.<pid>` 도 남는다 — 그대로 두면 쌓이고, 그 pid 가 재사용되면 rename 이 ENOTEMPTY 로 실패한다.
 */
export async function sweepStaleBuildDirs(final, { isAlive = pidAlive } = {}) {
  const dir = dirname(final);
  const removed = [];
  for (const prefix of [`${basename(final)}.build`, `${basename(final)}.old`]) {
    for (const name of await readdir(dir).catch(() => [])) {
      if (name !== prefix && !name.startsWith(`${prefix}.`)) continue;
      const pid = Number(name.slice(prefix.length + 1));
      if (name !== prefix && Number.isInteger(pid) && pid > 0 && (pid === process.pid || isAlive(pid))) continue;
      await rm(join(dir, name), { recursive: true, force: true });
      removed.push(name);
    }
  }
  return removed;
}

// 잠금 파일은 만들고(wx) 나서 pid 를 쓴다 — 그 사이 빈 파일을 «죽은 잠금» 으로 보면 산 잠금을 깨뜨린다.
// 빈 채로 이만큼 지나야만 죽은 것으로 본다(만들고 쓰는 사이에 죽은 경우).
const EMPTY_LOCK_GRACE_MS = 5_000;

/**
 * 지은 디렉토리를 최종 자리에 넣는다. 두 빌드가 동시에 끝나면 `rm(final)`·`rename` 사이에 서로 끼어
 * 한쪽이 ENOTEMPTY 로 죽었다(2026-11-14 감사) — 교체 구간만 잠금 파일로 줄 세운다(나중 것이 이긴다).
 */
export async function swapIn(build, final, { isAlive = pidAlive, waitMs = 60_000 } = {}) {
  const lock = `${final}.swap-lock`;
  const deadline = Date.now() + waitMs;
  for (;;) {
    try { await writeFile(lock, String(process.pid), { flag: 'wx' }); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const text = await readFile(lock, 'utf8').catch((err) => (err.code === 'ENOENT' ? null : ''));
      if (text === null) continue; // 그새 풀렸다
      const holder = Number(text);
      const dead = text === ''
        ? (await stat(lock).then((st) => Date.now() - st.mtimeMs, () => 0)) > EMPTY_LOCK_GRACE_MS
        : !(holder > 0) || !isAlive(holder);
      if (dead) { await reapLock(lock, text, isAlive); continue; } // 죽은 빌드의 잠금
      if (Date.now() > deadline) throw new Error(`swapIn: ${lock} 를 pid ${holder} 가 ${waitMs}ms 넘게 쥐고 있다`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  try {
    const old = `${final}.old.${process.pid}`;
    let moved = false;
    try { await rename(final, old); moved = true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    try { await rename(build, final); } catch (e) { if (moved) await rename(old, final).catch(() => {}); throw e; }
    if (moved) await rm(old, { recursive: true, force: true });
  } finally {
    await rm(lock, { force: true });
  }
}

/**
 * 죽은 잠금을 치운다. «읽고 나서 지우기» 사이에 다른 대기자가 먼저 치우고 새로 잡았으면 그 산 잠금을
 * 지우게 된다(2026-11-14 감사: 죽은 잠금으로 시작한 스트레스에서 600회당 0~2번 배타가 깨짐) —
 * 치우는 쪽끼리 `.reap` 잠금으로 줄 세우고, 그 안에서 내용이 아까 본 그대로일 때만 지운다.
 */
async function reapLock(lock, seen, isAlive) {
  const reap = `${lock}.reap`;
  try { await writeFile(reap, String(process.pid), { flag: 'wx' }); } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    // 치우던 쪽이 죽었으면 그 표시도 치운다(잠깐 쥐는 것이라 오래 남았으면 죽은 것).
    const age = await stat(reap).then((st) => Date.now() - st.mtimeMs, () => 0);
    const owner = Number(await readFile(reap, 'utf8').catch(() => ''));
    if (age > EMPTY_LOCK_GRACE_MS || (owner > 0 && !isAlive(owner))) await rm(reap, { force: true });
    return;
  }
  try {
    const now = await readFile(lock, 'utf8').catch((err) => (err.code === 'ENOENT' ? null : undefined));
    if (now === seen) await rm(lock, { force: true });
  } finally {
    await rm(reap, { force: true });
  }
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
