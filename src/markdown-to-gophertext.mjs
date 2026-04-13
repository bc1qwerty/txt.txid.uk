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

function wrap(text, width = WRAP) {
  const out = [];
  for (const rawLine of text.split('\n')) {
    if (rawLine.length <= width) {
      out.push(rawLine);
      continue;
    }
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
        out.push(text.toUpperCase());
        out.push('='.repeat(Math.min(WRAP, text.length)));
      } else if (level === 2) {
        out.push('');
        out.push(text);
        out.push('-'.repeat(Math.min(WRAP, text.length)));
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
