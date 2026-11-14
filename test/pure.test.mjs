// 세 빌더가 같이 쓰는 순수 모듈의 최소 벡터. 빌더 본체는 CI 가 라이브 피드로 돌린다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFeedFloor, assertFeedShape } from '../src/feed-guard.mjs';
import { rewriteLearnLinks, learnSlug, assertNoBareLearnLinks } from '../src/learn-links.mjs';
import { renderMarkdown, esc } from '../src/markdown.mjs';
import { markdownToGemtext } from '../src/markdown-to-gemtext.mjs';
import { markdownToGopherText, wrap } from '../src/markdown-to-gophertext.mjs';

const posts = (n, extra = {}) => Array.from({ length: n }, () => ({ ...extra }));
const learn = (en, ko, ja) => ({ posts: [...posts(en, { lang: 'en' }), ...posts(ko, { lang: 'ko' }), ...posts(ja, { lang: 'ja' })] });

test('feed floor: 정상 규모는 통과', () => {
  assertFeedFloor({ posts: posts(395) }, learn(265, 265, 265));
});
test('feed floor: 빈 피드·없는 피드는 거절', () => {
  assert.throws(() => assertFeedFloor({ posts: [] }, learn(265, 265, 265)), /너무 작다/);
  assert.throws(() => assertFeedFloor({ posts: posts(395) }, { posts: [] }), /너무 작다/);
  assert.throws(() => assertFeedFloor(null, undefined), /너무 작다/);
});
test('feed floor: 한 언어가 통째로 빠지면 합계가 하한을 넘어도 거절', () => {
  assert.throws(() => assertFeedFloor({ posts: posts(395) }, learn(265, 265, 0)), /ja 가 너무 작다/);
  assert.throws(() => assertFeedFloor({ posts: posts(395) }, learn(0, 265, 265)), /en 가 너무 작다/);
});

test('learn 링크 재작성', () => {
  assert.equal(
    rewriteLearnLinks('[a](/en/ideas/pow/) [g](/ko/glossary/) [x](https://e.x/)'),
    '[a](/learn/en/ideas/pow/) [g](https://learn.txid.uk/ko/glossary/) [x](https://e.x/)'
  );
  assert.equal(
    rewriteLearnLinks('[a](/en/ideas/pow/#h) [s](/en/ideas/)', { gemini: true }),
    '[a](/learn/en/ideas/pow.gmi#h) [s](/learn/en/ideas/)'
  );
});
test('learn 슬러그·잔여 링크 가드', () => {
  assert.equal(learnSlug('proof-of-work'), 'proof-of-work');
  assert.throws(() => learnSlug('What Is Bitcoin?'), /URL-unsafe/);
  assert.throws(() => assertNoBareLearnLinks('<a href="/en/ideas/x/">', 't'), /재작성 안 된/);
  assertNoBareLearnLinks('<a href="/learn/en/ideas/x/">', 't');
});

test('markdown → HTML: 원시 HTML 은 글자로, 링크는 안전한 스킴만', () => {
  const html = renderMarkdown('# T\n\n<script>x</script> **b** [l](https://a.b) [m](/learn/en/) [x](javascript:alert(1))');
  assert.match(html, /<h1>T<\/h1>/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(html, /<strong>b<\/strong>/);
  assert.match(html, /<a href="https:\/\/a\.b">l<\/a>/);
  assert.match(html, /<a href="\/learn\/en\/">m<\/a>/);
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.doesNotMatch(renderMarkdown('[x](JaVaScRiPt:alert(1)) [y](data:text/html,x) [z]( javascript:1)'), /href=/);
  assert.equal(esc('<a&"'), '&lt;a&amp;&quot;');
});

test('markdown → gemtext·gophertext', () => {
  assert.equal(markdownToGemtext('# T\n\ntext [l](https://a.b) end\n\n- i'), '# T\n\ntext l end\n=> https://a.b l\n\n* i\n');
  assert.match(markdownToGopherText('# T\n\ntext [l](https://a.b)'), /^T\n=+\n\ntext l \[https:\/\/a\.b\]\n$/);
  for (const line of wrap('aa '.repeat(20), 20).split('\n')) assert.ok(line.length <= 21);
});

test('gopher: CJK 줄바꿈이 URL·영단어를 쪼개지 않고 마침표를 줄 머리에 두지 않는다', () => {
  const url = 'https://txid.uk/some/long/path';
  const line = '가'.repeat(30) + ' ' + url + ' 를 본다' + '나'.repeat(33) + '.';
  const out = markdownToGopherText(line);
  assert.ok(out.includes(url), out);
  for (const l of out.split('\n')) {
    assert.ok(!/^[.,)。、]/.test(l), JSON.stringify(l));
    assert.notEqual(l, '.');
  }
  // 폭 70 을 정확히 채운 뒤의 마침표는 앞줄에 붙는다
  assert.equal(markdownToGopherText('가'.repeat(35) + '.'), '가'.repeat(35) + '.\n');
  assert.equal(wrap('한' + ' abcdefghij'.repeat(8)).split('\n').every((l) => !/^ /.test(l) && /^(한|abcdefghij)( abcdefghij)*$/.test(l)), true);
});
test('gopher: 코드 블록은 접지 않고, 홀로 선 마침표는 무해하게', () => {
  const code = 'bitcoin-cli -named createrawtransaction inputs=\'[{"txid":"abc","vout":0}]\' outputs=\'{"bc1q":0.001}\' 한글주석';
  const out = markdownToGopherText('글\n\n```\n' + code + '\n```\n\n.\n');
  assert.ok(out.includes('    ' + code), out);
  assert.ok(!/^\.$/m.test(out), out);
});

test('컴포넌트 안 본문은 세 미러 모두에 남는다(껍데기만 벗긴다)', () => {
  const md = [
    '<InfoBox type="info">', 'Read the original: [bitcoin.org](https://bitcoin.org/bitcoin.pdf) nine pages.', '</InfoBox>', '',
    '<CompareTable>', '| A | B |', '|---|---|', '| gold | bitcoin |', '</CompareTable>', '',
    '<AdultQuiz id="x" courseId="y">', 'q: Is the supply capped?', 'a: O', 'explain: Twenty-one million.', '</AdultQuiz>', '',
    '<ChartLine data={[1,2]} />',
  ].join('\n');
  for (const out of [renderMarkdown(md), markdownToGemtext(md), markdownToGopherText(md)]) {
    assert.match(out, /Read the original/);
    assert.match(out, /bitcoin\.org\/bitcoin\.pdf/);
    assert.match(out, /gold/);
    assert.match(out, /Q\. Is the supply capped\?.*A\. O.*Twenty-one million/);
    assert.doesNotMatch(out, /InfoBox|CompareTable|AdultQuiz|ChartLine/);
  }
});

test('링크 주소의 &amp; 는 한 번만 이스케이프된다', () => {
  const md = '[src](https://e.x/a?b=1&amp;c=2)';
  assert.match(renderMarkdown(md), /href="https:\/\/e\.x\/a\?b=1&amp;c=2"/);
  assert.match(markdownToGopherText(md), /\[https:\/\/e\.x\/a\?b=1&c=2\]/);
  assert.match(markdownToGemtext(md), /=> https:\/\/e\.x\/a\?b=1&c=2/);
});

test('markdown → HTML: 코드 스팬·코드 블록 안의 HTML 은 이스케이프된다', () => {
  assert.match(renderMarkdown('a `<script>x</script>` b'), /&lt;script&gt;x&lt;\/script&gt;/);
  const block = renderMarkdown('```\n<img src=x onerror=1>\n```');
  assert.match(block, /&lt;img src=x onerror=1&gt;/);
  assert.doesNotMatch(block, /<img/);
});

test('gopher: 사이트 안 글 링크는 .txt 선택자로, 인용·목록의 이어지는 줄은 머리를 지킨다', () => {
  assert.match(markdownToGopherText('see [pow](/learn/ja/ideas/pow/) and [x](/learn/ko/glossary/)'), /\[\/learn\/ja\/ideas\/pow\.txt\]/);
  const quote = markdownToGopherText('intro\n\n> ' + 'word '.repeat(40));
  const qLines = quote.split('\n').filter((l) => l.trim()).slice(1);
  assert.ok(qLines.length > 1);
  for (const l of qLines) assert.match(l, /^  \| /);
  const list = markdownToGopherText('- top\n  - ' + 'nested '.repeat(30)).split('\n').filter((l) => l.trim());
  assert.match(list[1], /^  \* nested/);
  for (const l of list.slice(2)) assert.match(l, /^    nested/);
  for (const l of [...qLines, ...list]) assert.ok(l.length <= 70, l);
});

test('feed shape: slug·lang·section 이 경로를 벗어나면 거절', () => {
  const ok = { posts: [{ slug: 'a-b.c' }] };
  const lok = { posts: [{ lang: 'ko', section: 'ideas', slug: 'concepts/anatta' }] };
  assert.doesNotThrow(() => assertFeedShape(ok, lok));
  for (const slug of ['../x', 'a/b', '', '.hidden', 'a b']) assert.throws(() => assertFeedShape({ posts: [{ slug }] }, lok), /slug/);
  assert.throws(() => assertFeedShape(ok, { posts: [{ lang: 'xx', section: 'ideas', slug: 'a' }] }), /lang/);
  assert.throws(() => assertFeedShape(ok, { posts: [{ lang: 'ko', section: '../x', slug: 'a' }] }), /section/);
  assert.throws(() => assertFeedShape(ok, { posts: [{ lang: 'ko', section: 'ideas', slug: 'a/../b' }] }), /slug/);
});

test('markdown → HTML: 들여쓴 항목은 하위 목록, 끊긴 번호 목록은 번호를 잇는다', () => {
  const html = renderMarkdown('1. 하나\n   - 가\n   - 나\n2. 둘\n\n문단\n\n3. 셋');
  assert.match(html, /<ol><li>하나<ul><li>가<\/li><li>나<\/li><\/ul><\/li><li>둘<\/li><\/ol>/);
  assert.match(html, /<ol start="3"><li>셋<\/li><\/ol>/);
  assert.match(renderMarkdown('- [x] 끝\n- [ ] 남음'), /<ul><li>☑ 끝<\/li><li>☐ 남음<\/li><\/ul>/);
});

test('gemtext: 들여쓴 항목도 목록 줄로 / gopher: 깊은 슬러그 링크는 파일 이름 규칙(_)으로', () => {
  const g = markdownToGemtext('1. 하나\n   - 가\n2. 둘');
  assert.deepEqual(g.split('\n').filter((l) => l.startsWith('* ')), ['* 하나', '* 가', '* 둘']);
  const t = markdownToGopherText('[무아](/learn/ko/dharma/concepts/anatta/) 와 [목록](/learn/ko/ideas/)');
  assert.match(t, /\[\/learn\/ko\/dharma\/concepts_anatta\.txt\]/);
  assert.match(t, /\[\/learn\/ko\/ideas\/\]/);
});

test('컴포넌트 제거는 코드 블록·인라인 코드 안을 건드리지 않는다', () => {
  const md = [
    'Use `<InfoBox type="tip">` to wrap a note, or `<Chart />`.',
    '',
    '```mdx',
    "import Foo from './foo';",
    '<InfoBox>',
    'inside code',
    '</InfoBox>',
    '<Mermaid code={`a --> b`} />',
    '```',
    '',
    '<InfoBox>',
    'real `code` note',
    '</InfoBox>',
    '<ChartLine data={x} />',
  ].join('\n');
  for (const out of [renderMarkdown(md), markdownToGemtext(md), markdownToGopherText(md)]) {
    assert.match(out, /InfoBox type=(&quot;|")tip/, '인라인 코드의 태그 이름이 남아야 한다');
    assert.match(out, /import Foo from/, '코드 블록의 import 가 남아야 한다');
    assert.match(out, /inside code/);
    assert.match(out, /a --(&gt;|>) b/, '코드 블록의 Mermaid 예시가 남아야 한다');
    assert.match(out, /real/);
    assert.doesNotMatch(out, /ChartLine/, '본문의 그림 컴포넌트는 종전대로 지운다');
    assert.doesNotMatch(out, /\u0000/, '자리표가 새지 않는다');
  }
});

test('링크 주소의 이중 인코딩(&amp;amp;)도 & 하나로 푼다', () => {
  const md = '[src](https://e.x/a?b=1&amp;amp;c=2&amp;d=3)';
  assert.match(renderMarkdown(md), /href="https:\/\/e\.x\/a\?b=1&amp;c=2&amp;d=3"/);
  assert.match(markdownToGopherText(md), /\[https:\/\/e\.x\/a\?b=1&c=2&d=3\]/);
  assert.match(markdownToGemtext(md), /=> https:\/\/e\.x\/a\?b=1&c=2&d=3/);
});

test('빌드 디렉토리는 pid 마다 따로이고, 죽은 빌드의 잔재만 치운다', async () => {
  const { buildDirFor, sweepStaleBuildDirs } = await import('../src/build-dir.mjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'txt-build-'));
  try {
    const final = path.join(root, 'dist');
    assert.notEqual(buildDirFor(final, 11), buildDirFor(final, 22));
    for (const n of ['dist', 'dist.build', 'dist.build.11', 'dist.build.22', `dist.build.${process.pid}`, 'dist-gemini.build.11']) fs.mkdirSync(path.join(root, n));
    const removed = await sweepStaleBuildDirs(final, { isAlive: (pid) => pid === 22 });
    assert.deepEqual(removed.sort(), ['dist.build', 'dist.build.11']);
    assert.deepEqual(fs.readdirSync(root).sort(), ['dist', `dist.build.${process.pid}`, 'dist.build.22', 'dist-gemini.build.11'].sort());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// 2026-11-14 5회차 감사: gemini 표는 미리 서식된 블록이라 칸 안의 `**…**`·`[x](/…)` 가 글자 그대로 보였다(gopher 는 이미 정리).
test('gemtext 표 칸: 굵게·링크 문법을 걷고 링크는 표 뒤 => 줄로', () => {
  const gmi = markdownToGemtext('| 항목 | 값 |\n|---|---|\n| **합계** | [시간선호](/learn/ko/ideas/time-preference/) |\n| `code` | ~~x~~ |\n');
  assert.doesNotMatch(gmi, /\*\*|\]\(|`code`|~~/);
  assert.match(gmi, /^\| 합계 \| 시간선호 \|$/m);
  assert.match(gmi, /^=> \/learn\/ko\/ideas\/time-preference\/ 시간선호$/m);
  // 표 블록이 닫힌 뒤에 링크 줄이 온다
  assert.ok(gmi.indexOf('=> ') > gmi.lastIndexOf('```'));
});

test('swapIn: 동시에 끝난 두 빌드가 교체에서 서로 죽이지 않는다', async () => {
  const { mkdtemp, mkdir, writeFile, readFile, readdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { swapIn } = await import('../src/build-dir.mjs');
  const root = await mkdtemp(join(tmpdir(), 'txt-swap-'));
  const final = join(root, 'dist');
  await mkdir(final); await writeFile(join(final, 'v'), 'old');
  for (const n of ['a', 'b']) { await mkdir(join(root, `b-${n}`)); await writeFile(join(root, `b-${n}`, 'v'), n); }
  await Promise.all([swapIn(join(root, 'b-a'), final), swapIn(join(root, 'b-b'), final)]);
  assert.match(await readFile(join(final, 'v'), 'utf8'), /^[ab]$/);
  assert.deepEqual((await readdir(root)).sort(), ['dist']); // 잠금·옛 디렉토리가 남지 않는다
});

// 2026-11-14 6회차 감사: 막 만들어 아직 빈 잠금 파일을 «죽은 잠금» 으로 보고 지워 배타가 깨졌고(10×60×3 스트레스에서 2번),
// 교체 중에 죽은 빌드의 `dist.old.<pid>` 는 치우지 않아 쌓였다.
test('swapIn: 빈 잠금 파일은 살아 있는 것으로 보고 기다린다(유예가 지난 빈 잠금만 치운다)', async () => {
  const { mkdtemp, mkdir, writeFile, readFile, utimes } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { swapIn } = await import('../src/build-dir.mjs');
  const root = await mkdtemp(join(tmpdir(), 'txt-swap-empty-'));
  const final = join(root, 'dist');
  await mkdir(join(root, 'b')); await writeFile(join(root, 'b', 'v'), 'new');
  await writeFile(`${final}.swap-lock`, ''); // 방금 만든(아직 pid 를 안 쓴) 잠금
  await assert.rejects(swapIn(join(root, 'b'), final, { waitMs: 300 }), /swap-lock/);
  const old = new Date(Date.now() - 10_000);
  await utimes(`${final}.swap-lock`, old, old); // 만들고 쓰는 사이에 죽은 잠금
  await swapIn(join(root, 'b'), final, { waitMs: 300 });
  assert.equal(await readFile(join(final, 'v'), 'utf8'), 'new');
});

// 2026-11-14 7회차: 죽은 잠금을 여럿이 동시에 치우면, 늦은 쪽이 앞선 쪽이 막 새로 잡은 산 잠금까지 지웠다.
test('swapIn: 죽은 잠금에 대기자가 몰려도 모두 끝나고 잠금·회수 표시가 남지 않는다', async () => {
  const { mkdtemp, mkdir, writeFile, readdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { swapIn } = await import('../src/build-dir.mjs');
  const root = await mkdtemp(join(tmpdir(), 'txt-swap-reap-'));
  const final = join(root, 'dist');
  await mkdir(final); await writeFile(join(final, 'v'), 'old');
  await writeFile(`${final}.swap-lock`, '999999'); // 죽은 빌드가 남긴 잠금
  const isAlive = (pid) => pid === process.pid; // 999999 는 죽은 것으로
  const runs = Array.from({ length: 8 }, async (_, i) => {
    const b = join(root, `b-${i}`); await mkdir(b); await writeFile(join(b, 'v'), String(i));
    await swapIn(b, final, { isAlive, waitMs: 10_000 });
  });
  // 프로세스 사이의 배타는 여러 프로세스 스트레스 리그로 본다 — 여기서는 모두 끝나고 잠금·회수 표시가 남지 않는지.
  await Promise.all(runs);
  const left = (await readdir(root)).filter((n) => n.startsWith('dist'));
  assert.deepEqual(left, ['dist']);
});

test('sweepStaleBuildDirs: 죽은 빌드의 dist.old.<pid> 도 치운다', async () => {
  const { sweepStaleBuildDirs } = await import('../src/build-dir.mjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'txt-old-'));
  try {
    for (const n of ['dist', 'dist.old.11', 'dist.old.22']) fs.mkdirSync(path.join(root, n));
    const removed = await sweepStaleBuildDirs(path.join(root, 'dist'), { isAlive: (pid) => pid === 22 });
    assert.deepEqual(removed, ['dist.old.11']);
    assert.deepEqual(fs.readdirSync(root).sort(), ['dist', 'dist.old.22']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
