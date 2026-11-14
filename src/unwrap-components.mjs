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
  // 원문이 이중으로 인코딩해 온 것(`&amp;amp;`)도 한 번에 푼다.
  return md.replace(/\]\(([^)\s]+)/g, (_, url) => `](${url.replace(/&(?:amp;)+/g, '&')}`);
}

// 코드 블록과 인라인 코드는 컴포넌트·태그 제거에서 뺀다 — `<InfoBox>` 를 설명하는 글의 코드가 빈 값이 됐다.
// 코드를 자리표로 바꿔 두고 fn 을 돌린 뒤 되돌린다(잘라서 따로 돌리면 코드를 품은 여러 줄 컴포넌트가 안 맞는다).
export function outsideCode(md, fn) {
  const kept = [];
  const hold = (m) => `\u0000${kept.push(m) - 1}\u0000`;
  let masked = md.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, hold);
  masked = masked.replace(/(`+)(?!`)[^\n]*?[^`\n]\1(?!`)/g, hold);
  // 자리표가 자리표 안에 들 수 있어(코드 블록 속 인라인은 없지만 순서 보장을 위해) 뒤에서부터 푼다.
  let out = fn(masked);
  for (let i = kept.length - 1; i >= 0; i--) out = out.replace(`\u0000${i}\u0000`, () => kept[i]);
  return out;
}
