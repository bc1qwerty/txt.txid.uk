// 피드 받기의 공용 안전장치 — 세 빌더(html·gemini·gopher)가 같이 쓴다.

// 응답이 멈추면 로컬 배포가 무기한 매달린다.
export const FEED_TIMEOUT_MS = 30_000;

// 원본이 빈 피드나 일부만 든 피드를 내도 빌드는 성공하고, 배포는 `rsync --delete` 로
// 미러를 그대로 비운다. 지금 규모(news 약 400, learn 약 800)보다 한참 아래에 하한을 둔다.
const MIN_NEWS_POSTS = 100;
const MIN_LEARN_POSTS = 400;

export function assertFeedFloor(newsFeed, learnFeed) {
  const news = newsFeed?.posts?.length ?? 0;
  const learn = learnFeed?.posts?.length ?? 0;
  if (news < MIN_NEWS_POSTS || learn < MIN_LEARN_POSTS) {
    throw new Error(
      `피드가 너무 작다: news ${news}(하한 ${MIN_NEWS_POSTS}), learn ${learn}(하한 ${MIN_LEARN_POSTS}) — 미러를 덮어쓰지 않는다`
    );
  }
}
