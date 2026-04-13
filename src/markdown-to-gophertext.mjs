// Minimal markdown -> plain text converter for Gopher.
// Unlike gemtext, Gopher text files are just plain text (type 0).
// Strip all formatting. Preserve paragraphs and code blocks as-is.

function stripJsx(md) {
  md = md.replace(/^\s*import\s+[^;\n]+\s+from\s+['"][^'"]+['"];?\s*$/gm, '');
  md = md.replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');
  md = md.replace(/<[A-Z][A-Za-z0-9]*\s*[^>]*\/>/g, '');
  md = md.replace(/<([A-Z][A-Za-z0-9]*)\s*[^>]*>[\s\S]*?<\/\1>/g, '');
  md = md.replace(/<!--[\s\S]*?-->/g, '');
  return md;
}

function stripFrontmatter(md) {
  return md.replace(/^---\n[\s\S]*?\n---\n/, '');
}

function stripInline(text) {
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1$2');
  text = text.replace(/(^|[\s(])_([^_\n]+)_/g, '$1$2');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '$1 [$2]');
  return text;
}

const WRAP = 70;
const CJK_RE = /[\u3000-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]/;

function visualWidth(s) {
  let w = 0;
  for (const ch of s) w += CJK_RE.test(ch) ? 2 : 1;
  return w;
}

function wrapCJK(line, width) {
  // CJK lines: break at character boundary, counting CJK as width 2
  const out = [];
  let buf = '';
  let vw = 0;
  for (const ch of line) {
    const cw = CJK_RE.test(ch) ? 2 : 1;
    if (vw + cw > width && buf) {
      out.push(buf);
      buf = ch;
      vw = cw;
    } else {
      buf += ch;
      vw += cw;
    }
  }
  if (buf) out.push(buf);
  return out;
}

export function wrap(text, width = WRAP) {
  const out = [];
  for (const rawLine of text.split('\n')) {
    if (visualWidth(rawLine) <= width) {
      out.push(rawLine);
      continue;
    }
    if (CJK_RE.test(rawLine)) {
      for (const chunk of wrapCJK(rawLine, width)) out.push(chunk);
      continue;
    }
    // ASCII: word wrap
    const words = rawLine.split(/\s+/);
    let line = '';
    for (const w of words) {
      if (line.length === 0) {
        line = w;
      } else if (line.length + 1 + w.length <= width) {
        line += ' ' + w;
      } else {
        out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out.join('\n');
}

export function markdownToGopherText(md) {
  let s = stripFrontmatter(md || '');
  s = stripJsx(s);

  const lines = s.split('\n');
  const out = [];
  let inCode = false;

  for (let line of lines) {
    if (line.trim().startsWith('```')) {
      inCode = !inCode;
      out.push('');
      continue;
    }
    if (inCode) {
      out.push('    ' + line);
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = stripInline(h[2]);
      if (level === 1) {
        out.push('');
        const wrapped = wrap(text.toUpperCase(), WRAP).split('\n');
        for (const w of wrapped) out.push(w);
        out.push('='.repeat(WRAP));
      } else if (level === 2) {
        out.push('');
        const wrapped = wrap(text, WRAP).split('\n');
        for (const w of wrapped) out.push(w);
        out.push('-'.repeat(WRAP));
      } else {
        out.push('');
        out.push('## ' + text);
      }
      continue;
    }

    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      out.push('  | ' + stripInline(bq[1]));
      continue;
    }

    const ul = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (ul) {
      const indent = ul[1].length;
      out.push(' '.repeat(indent) + '* ' + stripInline(ul[2]));
      continue;
    }
    const ol = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (ol) {
      const indent = ol[1].length;
      out.push(' '.repeat(indent) + '* ' + stripInline(ol[2]));
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push('_'.repeat(WRAP));
      continue;
    }

    out.push(stripInline(line));
  }

  let text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  text = wrap(text, WRAP);
  return text + '\n';
}
