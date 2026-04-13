// Minimal markdown -> gemtext converter. Zero dependencies.
// Gemtext spec: https://gemini.circumlunar.space/docs/gemtext.gmi
//
// Conversion rules:
// - Headings: #, ##, ### preserved (#### and deeper collapse to ###)
// - Paragraphs: inline formatting stripped (bold, italic, inline code, inline
//   links keep their text; URLs are appended as `=>` lines after the paragraph)
// - Lists: `- item` and `1. item` → `* item` (no ordered lists, no nesting)
// - Blockquotes: `> text` preserved
// - Code blocks: ```...``` preserved
// - Horizontal rules → a line of underscores
// - JSX-ish components stripped entirely
// - Tables → simple prefix `| cell | cell |` lines (preformatted-ish)

function stripJsx(md) {
  // ESM imports at top of MDX files: `import X from '@components/...';`
  md = md.replace(/^\s*import\s+[^;\n]+\s+from\s+['"][^'"]+['"];?\s*$/gm, '');
  md = md.replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');
  // JSX self-closing and paired tags
  md = md.replace(/<[A-Z][A-Za-z0-9]*\s*[^>]*\/>/g, '');
  md = md.replace(/<([A-Z][A-Za-z0-9]*)\s*[^>]*>[\s\S]*?<\/\1>/g, '');
  md = md.replace(/<!--[\s\S]*?-->/g, '');
  return md;
}

function extractLinks(text) {
  const links = [];
  // [label](url) → label, capture url
  const stripped = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, label, url) => {
    links.push({ label: label.trim(), url: url.trim() });
    return label;
  });
  return { text: stripped, links };
}

function stripInlineFormatting(text) {
  // Strip bold **x** and __x__
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  // Strip italic *x* and _x_ (avoid bold markers)
  text = text.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1$2');
  text = text.replace(/(^|[\s(])_([^_\n]+)_/g, '$1$2');
  // Strip inline code `x`
  text = text.replace(/`([^`]+)`/g, '$1');
  // Strip strikethrough ~~x~~
  text = text.replace(/~~([^~]+)~~/g, '$1');
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ').trim();
  return text;
}

function convertParagraph(paraLines) {
  const joined = paraLines.join(' ');
  const { text, links } = extractLinks(joined);
  const clean = stripInlineFormatting(text);
  const out = [];

  // If the paragraph reduces to just the labels of its links (no other prose),
  // skip the inline text and only emit the `=> url` lines. This avoids the
  // verbose duplication seen with patterns like `[→ Source](url)` standing alone.
  const labelsConcat = links.map((l) => l.label).join(' ').trim();
  const onlyLinks = links.length > 0 && clean.replace(/[\s→·•|,.]/g, '') === labelsConcat.replace(/[\s→·•|,.]/g, '');

  if (!onlyLinks) {
    out.push(clean);
  }

  // Deduplicate URLs (same URL mentioned multiple times)
  const seenUrls = new Set();
  for (const { label, url } of links) {
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    // Resolve relative URLs as-is; absolute stay absolute
    out.push(`=> ${url} ${label}`);
  }
  return out.join('\n');
}

export function markdownToGemtext(md) {
  if (!md) return '';
  md = stripJsx(md);
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(\*\*\*|---|___)\s*$/.test(line)) {
      out.push('________________________________________');
      i++;
      continue;
    }

    // Fenced code block
    if (/^```/.test(line)) {
      out.push('```');
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        out.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      out.push('```');
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      const level = Math.min(h[1].length, 3);
      const headerText = stripInlineFormatting(extractLinks(h[2]).text);
      out.push('#'.repeat(level) + ' ' + headerText);
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const qlines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        qlines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      const joined = qlines.join(' ');
      out.push('> ' + stripInlineFormatting(extractLinks(joined).text));
      continue;
    }

    // Unordered or ordered list
    if (/^([-*+]|\d+\.)\s+/.test(line)) {
      while (i < lines.length && /^([-*+]|\d+\.)\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^([-*+]|\d+\.)\s+/, '');
        // Task list checkbox
        const checked = itemText.match(/^\[[xX]\]\s+(.*)/);
        const unchecked = itemText.match(/^\[ \]\s+(.*)/);
        let inner;
        if (checked) inner = '[x] ' + checked[1];
        else if (unchecked) inner = '[ ] ' + unchecked[1];
        else inner = itemText;
        const { text, links } = extractLinks(inner);
        out.push('* ' + stripInlineFormatting(text));
        for (const { label, url } of links) {
          out.push(`=> ${url} ${label}`);
        }
        i++;
      }
      continue;
    }

    // Table (basic: header | col | col, separator, then rows)
    if (
      /\|/.test(line) &&
      i + 1 < lines.length &&
      /^[\s|:\-]+$/.test(lines[i + 1])
    ) {
      const header = line;
      i += 2; // skip header and separator
      out.push('```');
      out.push(header);
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) {
        out.push(lines[i]);
        i++;
      }
      out.push('```');
      continue;
    }

    // Paragraph — consume until blank or block token
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
    out.push(convertParagraph(p));
  }

  // Collapse multiple blank lines
  const final = [];
  for (const l of out) {
    if (l === '' && final.length && final[final.length - 1] === '') continue;
    final.push(l);
  }
  return final.join('\n').trim() + '\n';
}
