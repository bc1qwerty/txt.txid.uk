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
