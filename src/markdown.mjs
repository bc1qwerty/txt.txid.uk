import { outsideCode, unwrapComponents } from './unwrap-components.mjs';
// Minimal markdown-to-HTML renderer. Zero dependencies.
// Handles: headings, paragraphs, bold/italic, inline code, code blocks,
// links, lists (ul/ol), blockquotes, horizontal rules, tables (basic).
// Deliberately limited — brutalist mirror, not full commonmark.

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function renderInline(text) {
  // protect code spans first
  const codeSpans = [];
  text = text.replace(/`([^`]+)`/g, (_m, c) => {
    codeSpans.push(esc(c));
    return `\u0000${codeSpans.length - 1}\u0000`;
  });
  // escape the rest
  text = esc(text);
  // links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    // 스킴은 http(s)·mailto 와 사이트 안 경로만. 본문은 바깥 글에서 온 것이 섞이므로
    // `javascript:` 같은 주소는 링크로 만들지 않고 글자로 둔다(CSP 가 막더라도 렌더러에서 끊는다).
    if (!/^(https?:\/\/|mailto:|\/|#|\.\.?\/)/i.test(url.trim())) return _m;
    const safeUrl = url.replace(/"/g, '&quot;');
    return `<a href="${safeUrl}">${label}</a>`;
  });
  // bold **text** and __text__
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  // italic *text* and _text_
  text = text.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');
  // restore code spans
  text = text.replace(/\u0000(\d+)\u0000/g, (_m, i) => `<code>${codeSpans[+i]}</code>`);
  return text;
}

function renderBlock(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // horizontal rule
    if (/^(\*\*\*|---|___)\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // fenced code block
    if (/^```/.test(line)) {
      i++;
      const code = [];
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const qlines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        qlines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${renderBlock(qlines).join('\n')}</blockquote>`);
      continue;
    }

    // list (ul/ol, GFM task list, 들여쓴 하위 목록)
    if (/^([-*+]|\d+\.)\s+/.test(line)) {
      const r = renderList(lines, i);
      out.push(r.html);
      i = r.next;
      continue;
    }

    // table (basic: header | header \n --- | --- \n row | row)
    if (
      /\|/.test(line) &&
      i + 1 < lines.length &&
      /^[\s|:\-]+$/.test(lines[i + 1])
    ) {
      const header = line.split('|').map((c) => c.trim()).filter((c) => c !== '');
      i += 2; // skip header and separator
      const rows = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) {
        rows.push(lines[i].split('|').map((c) => c.trim()).filter((c) => c !== ''));
        i++;
      }
      out.push(
        '<table><thead><tr>' +
          header.map((h) => `<th>${renderInline(h)}</th>`).join('') +
          '</tr></thead><tbody>' +
          rows
            .map(
              (r) =>
                '<tr>' + r.map((c) => `<td>${renderInline(c)}</td>`).join('') + '</tr>'
            )
            .join('') +
          '</tbody></table>'
      );
      continue;
    }

    // paragraph — consume until blank or block token
    const p = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|```|>|\*\*\*|---|___|\d+\.\s|[-*+]\s)/.test(lines[i])
    ) {
      p.push(lines[i]);
      i++;
    }
    out.push(`<p>${renderInline(p.join(' '))}</p>`);
  }
  return out;
}

const LIST_ITEM = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;

// lines[i] 에서 시작하는 목록 하나. 더 들여쓴 항목은 바로 앞 항목의 하위 목록이 된다 —
// 예전엔 들여쓴 `-` 가 문단으로 뭉개지고, 그 뒤 번호 목록이 1 부터 다시 시작했다.
function renderList(lines, i) {
  const first = lines[i].match(LIST_ITEM);
  const base = first[1].length;
  const ordered = /\d/.test(first[2]);
  const start = ordered ? parseInt(first[2], 10) : 1;
  const items = [];
  while (i < lines.length) {
    const m = lines[i].match(LIST_ITEM);
    if (!m || m[1].length < base) break;
    if (m[1].length === base) {
      if (/\d/.test(m[2]) !== ordered) break;
      items.push({ text: m[3], kids: [] });
    } else {
      items[items.length - 1].kids.push(lines[i]);
    }
    i++;
  }
  const li = items.map((it) => {
    let inner;
    const checked = !ordered && it.text.match(/^\[[xX]\]\s+(.*)/);
    const unchecked = !ordered && it.text.match(/^\[ \]\s+(.*)/);
    if (checked) inner = `☑ ${renderInline(checked[1])}`;
    else if (unchecked) inner = `☐ ${renderInline(unchecked[1])}`;
    else inner = renderInline(it.text);
    let sub = '';
    for (let j = 0; j < it.kids.length;) {
      const r = renderList(it.kids, j);
      sub += r.html;
      j = r.next;
    }
    return `<li>${inner}${sub}</li>`;
  }).join('');
  const open = ordered ? (start > 1 ? `<ol start="${start}">` : '<ol>') : '<ul>';
  return { html: open + li + (ordered ? '</ol>' : '</ul>'), next: i };
}

// Strip JSX-looking tags that next-mdx-remote or MDX would render.
// These are server/client components we can't execute here.
// 코드 블록·인라인 코드 안은 건드리지 않는다(outsideCode).
function stripJsx(md) {
  return outsideCode(md, stripJsxOutsideCode);
}

function stripJsxOutsideCode(md) {
  // ESM imports at top of MDX files
  md = md.replace(/^\s*import\s+[^;\n]+\s+from\s+['"][^'"]+['"];?\s*$/gm, '');
  md = md.replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');
  // Mermaid JSX with --> arrows in props (our regex [^>]* breaks otherwise)
  // Mermaid uses template-literal props with <br/> inside — match up to `} />
  md = md.replace(/<Mermaid\b\s+code=\{`[\s\S]*?`\}\s*\/>/g, '');
  md = md.replace(/<Mermaid\b[\s\S]*?<\/Mermaid>/g, '');
  // PascalCase JSX components
  md = unwrapComponents(md);
  md = md.replace(/<[A-Z][A-Za-z0-9]*\s*[^>]*\/>/g, '');
  md = md.replace(/<([A-Z][A-Za-z0-9]*)\s*[^>]*>[\s\S]*?<\/\1>/g, '');
  // Leaked lowercase HTML: details/summary/br (leak from MDX)
  md = md.replace(/<br\s*\/?>/gi, '<br>');
  md = md.replace(/<\/?(?:details|summary)[^>]*>/gi, '');
  // HTML comments
  md = md.replace(/<!--[\s\S]*?-->/g, '');
  return md;
}

export function renderMarkdown(md) {
  if (!md) return '';
  const cleaned = stripJsx(md);
  const lines = cleaned.replace(/\r\n/g, '\n').split('\n');
  return renderBlock(lines).join('\n');
}

export { esc };
