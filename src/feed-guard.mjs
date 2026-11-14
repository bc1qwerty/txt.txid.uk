// 피드 받기의 공용 안전장치 — 세 빌더(html·gemini·gopher)가 같이 쓴다.

// 응답이 멈추면 로컬 배포가 무기한 매달린다.
export const FEED_TIMEOUT_MS = 30_000;

// 원본이 빈 피드나 일부만 든 피드를 내도 빌드는 성공하고, 배포는 `rsync --delete` 로
// 미러를 그대로 비운다. 지금 규모(news 약 400, learn 약 800)보다 한참 아래에 하한을 둔다.
const MIN_NEWS_POSTS = 100;
const MIN_LEARN_POSTS = 400;
// learn 은 세 언어가 같은 편수(지금 각 265)다. 한 언어가 통째로 빠져도 합계는 하한을 넘으므로
// 언어별로도 본다.
const LEARN_LANGS = ['en', 'ko', 'ja'];
const MIN_LEARN_PER_LANG = 130;

export function assertFeedFloor(newsFeed, learnFeed) {
  const news = newsFeed?.posts?.length ?? 0;
  const learn = learnFeed?.posts?.length ?? 0;
  if (news < MIN_NEWS_POSTS || learn < MIN_LEARN_POSTS) {
    throw new Error(
      `피드가 너무 작다: news ${news}(하한 ${MIN_NEWS_POSTS}), learn ${learn}(하한 ${MIN_LEARN_POSTS}) — 미러를 덮어쓰지 않는다`
    );
  }
  for (const lang of LEARN_LANGS) {
    const n = learnFeed.posts.filter((p) => p.lang === lang).length;
    if (n < MIN_LEARN_PER_LANG) {
      throw new Error(
        `learn 피드의 ${lang} 가 너무 작다: ${n}(하한 ${MIN_LEARN_PER_LANG}) — 미러를 덮어쓰지 않는다`
      );
    }
  }
  assertFeedShape(newsFeed, learnFeed);
}

// slug·lang·section 은 그대로 파일 경로와 링크가 된다. 자기 피드라 믿되, `..`·슬래시·빈 값이 섞이면
// 산출 디렉토리 밖에 쓰거나 깨진 링크를 낸다 — 짓기 전에 소리 내어 멈춘다.
const SAFE_SEG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export function assertFeedShape(newsFeed, learnFeed) {
  for (const p of newsFeed.posts) {
    if (!SAFE_SEG.test(String(p.slug)) || String(p.slug).includes('..')) {
      throw new Error(`news 피드의 slug 가 경로로 쓸 수 없다: ${JSON.stringify(p.slug)}`);
    }
  }
  for (const p of learnFeed.posts) {
    if (!LEARN_LANGS.includes(p.lang) || !/^[a-z0-9][a-z0-9-]*$/.test(String(p.section))) {
      throw new Error(`learn 피드의 lang·section 이 경로로 쓸 수 없다: ${JSON.stringify([p.lang, p.section, p.slug])}`);
    }
    // 슬러그는 dharma 처럼 하위 디렉토리를 가질 수 있다(`concepts/anatta`) — 세그먼트별로 본다.
    if (String(p.slug).split('/').some((seg) => !SAFE_SEG.test(seg) || seg.includes('..'))) {
      throw new Error(`learn 피드의 slug 가 경로로 쓸 수 없다: ${JSON.stringify(p.slug)}`);
    }
  }
}
