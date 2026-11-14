// 세 빌더가 같이 쓰는 순수 모듈의 최소 벡터. 빌더 본체는 CI 가 라이브 피드로 돌린다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFeedFloor } from '../src/feed-guard.mjs';
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
