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

    // unordered list
    if (/^[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ''));
        i++;
      }
      out.push(
        '<ul>' + items.map((it) => `<li>${renderInline(it)}</li>`).join('') + '</ul>'
      );
      continue;
    }

    // ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      out.push(
        '<ol>' + items.map((it) => `<li>${renderInline(it)}</li>`).join('') + '</ol>'
      );
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

// Strip JSX-looking tags that next-mdx-remote or MDX would render.
// These are server/client components we can't execute here.
function stripJsx(md) {
  // Remove self-closing JSX tags like <Component prop="x" />
  md = md.replace(/<[A-Z][A-Za-z0-9]*\s*[^>]*\/>/g, '');
  // Remove paired JSX tags like <Component>...</Component>
  md = md.replace(/<([A-Z][A-Za-z0-9]*)\s*[^>]*>[\s\S]*?<\/\1>/g, '');
  // Remove raw HTML comments
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
