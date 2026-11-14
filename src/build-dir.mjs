// 빌드는 옆 디렉토리에 짓고 끝에서 바꿔 끼운다. 이름에 pid 를 넣는다 — 고정 이름이면 news·learn 배포가 겹칠 때
// 한쪽이 다른 쪽의 반쯤 찬 디렉토리를 dist 로 올릴 수 있다.
import { readdir, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export const buildDirFor = (final, pid = process.pid) => `${final}.build.${pid}`;

/** 죽은 빌드가 남긴 디렉토리를 치운다(살아 있는 pid 의 것은 둔다). 옛 고정 이름(`.build`)도 같이. */
export async function sweepStaleBuildDirs(final, { isAlive = pidAlive } = {}) {
  const dir = dirname(final);
  const prefix = `${basename(final)}.build`;
  const removed = [];
  for (const name of await readdir(dir).catch(() => [])) {
    if (name !== prefix && !name.startsWith(`${prefix}.`)) continue;
    const pid = Number(name.slice(prefix.length + 1));
    if (name !== prefix && Number.isInteger(pid) && pid > 0 && (pid === process.pid || isAlive(pid))) continue;
    await rm(join(dir, name), { recursive: true, force: true });
    removed.push(name);
  }
  return removed;
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
