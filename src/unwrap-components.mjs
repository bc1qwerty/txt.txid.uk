// 본문을 감싸는 MDX 컴포넌트는 껍데기만 벗긴다. 통째로 지우면 그 안의 문단·표·퀴즈가 미러에서 사라진다
// (InfoBox 27 · CompareTable 18 · AdultQuiz 21 곳, 2026-11-14). 그림을 그리는 컴포넌트(Mermaid·Chart*)는
// 본문이 없으므로 호출한 쪽의 일반 제거에 맡긴다.
export function unwrapComponents(md) {
  md = md.replace(/<AdultQuiz\b[^>]*>([\s\S]*?)<\/AdultQuiz>/g, (_, body) => {
    const out = [];
    for (const line of body.split('\n')) {
      const m = /^\s*(q|a|explain):\s*(.*)$/.exec(line);
      if (!m) continue;
      if (m[1] === 'q') out.push(`- Q. ${m[2]}`);
      else if (out.length) out[out.length - 1] += m[1] === 'a' ? ` — A. ${m[2]}` : ` (${m[2]})`;
    }
    return out.length ? `\n${out.join('\n')}\n` : '';
  });
  md = md.replace(/<\/?(?:InfoBox|CompareTable)\b[^>]*>/g, '');
  // 원문(다이제스트 출처)의 링크 주소에 HTML 엔티티가 그대로 온다 — 주소 안의 `&amp;` 는 `&` 다.
  return md.replace(/\]\(([^)\s]+)/g, (_, url) => `](${url.replace(/&amp;/g, '&')}`);
}
