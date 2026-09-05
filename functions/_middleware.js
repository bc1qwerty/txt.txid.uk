// CF Pages 기본 도메인(txt-txid-uk.pages.dev 등) → 커스텀 도메인 301.
// 그 origin 은 api.txid.uk CORS 밖이라 로그인·인증 fetch 가 막힌다
// ("Failed to fetch"). 정본으로 보낸다(경로·쿼리 보존). 2026-09-05.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname.endsWith('.pages.dev')) {
    return Response.redirect('https://txt.txid.uk' + url.pathname + url.search, 301);
  }
  return context.next();
}
