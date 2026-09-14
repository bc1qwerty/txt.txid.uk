/**
 * learn 본문의 내부 링크를 txt 미러 경로로 재작성한다.
 *
 * ⚠ 왜 있나 (2026-08-31):
 * learn 본문의 내부 링크는 learn 사이트 기준 루트 상대경로(`/en/ideas/proof-of-work/`)
 * 인데, 이 미러는 같은 문서를 `/learn/en/...` 에 서빙한다. 목록·사이트맵 링크만
 * `/learn/` 접두사를 붙이고 본문은 무변환으로 통과시켜서, **본문 상호링크 3,165곳
 * (고유 466개)이 전부 404** 였다(전수 실측: 466/466 이 404). gemini 미러도 동일하게
 * 3,141개가 깨져 있었다.
 *
 * 마크다운 단계에서 치환한다 — HTML·gemtext·gophertext 세 변환기가 전부 이 단계를
 * 지나므로 한 곳으로 셋을 다 고칠 수 있다.
 *
 * ⚠ news 본문에는 적용하지 말 것. 이 패턴은 learn 의 로케일 경로 구조를 전제한다.
 */
// 피드에 없어서 미러가 만들지 않는 learn 경로들. 여기로 가는 링크는 미러 내부가
// 아니라 **원본 사이트 절대 URL** 로 보낸다(미러 내부로 보내면 404 다 — 실측:
// /ko/glossary/ 1건이 그랬다). 새 특수 페이지가 생기면 여기에 추가.
const NON_MIRRORED = /^\/(en|ko|ja)\/(glossary|roadmap|bookmarks)(\/|$)/;

export function rewriteLearnLinks(md, { gemini = false } = {}) {
  let out = String(md || '').replace(
    /\]\((\/(?:en|ko|ja)\/[^)]*)\)/g,
    (m, path) => NON_MIRRORED.test(path)
      ? `](https://learn.txid.uk${path})`
      : `](/learn${path})`
  );
  if (gemini) {
    // gemini 미러의 개별 글은 디렉토리가 아니라 `<slug>.gmi` **파일**이다
    // (emit: learn/<lang>/<section>/<slug>.gmi). 글 링크(세그먼트 3개)만 확장자로
    // 바꾸고, 섹션 인덱스(세그먼트 2개)는 그대로 둔다 — 서버가 index.gmi 를 찾는다.
    out = out.replace(
      /\]\(\/learn\/(en|ko|ja)\/([a-z0-9-]+)\/([^)/\s#]+)\/(#[^)]*)?\)/g,
      '](/learn/$1/$2/$3.gmi$4)'
    );
  }
  return out;
}

/**
 * learn 슬러그를 디렉토리명·링크 공용으로 검증해 돌려준다.
 * ⚠ encodeURIComponent 로 감싸면 안 된다 — 파일명은 리터럴 `%XX` 가 되는데
 * CF Pages 는 링크의 `%XX` 를 디코드해 다른 이름을 찾는다(태그 92/255 페이지
 * 404 실사고와 동일 기전, build.mjs tagSlug 주석 참조). URL-safe 가 아닌
 * 슬러그는 여기서 소리내어 실패시킨다 — 현재 데이터(660개)는 전부 통과한다.
 */
export function learnSlug(slug) {
  const s = String(slug);
  if (encodeURIComponent(s) !== s) {
    throw new Error(
      `[learn-links] URL-unsafe learn slug: "${s}" — 디렉토리명과 링크가 어긋나 ` +
      `404 가 된다(태그 92페이지 사고와 동일 기전). learn 쪽 슬러그를 고칠 것.`
    );
  }
  return s;
}

/** 렌더 결과에 미러 기준으로 깨진 learn 링크가 남았는지 검사한다(빌드 가드).
 *  3,141개 링크 깨짐 실사고는 gemini 미러에서 났다 — 세 출력 경로 모두 검사할 것. */
const BARE_LEARN_PATTERNS = {
  html: /href="\/(en|ko|ja)\/[^"]*"/,
  gemini: /^=> \/(en|ko|ja)\//m,
  gopher: /\]\(\/(en|ko|ja)\//,
};

export function assertNoBareLearnLinks(text, where, format = 'html') {
  const m = String(text).match(BARE_LEARN_PATTERNS[format]);
  if (m) {
    throw new Error(
      `[learn-links] ${where}: 재작성 안 된 learn 내부 링크가 남았다 → ${m[0]}\n` +
      `  rewriteLearnLinks() 를 거치지 않은 경로가 새로 생겼다는 뜻이다.`
    );
  }
}
