import { unwrapComponents } from './unwrap-components.mjs';
// Minimal markdown -> plain text converter for Gopher.
// Unlike gemtext, Gopher text files are just plain text (type 0).
// Strip all formatting. Preserve paragraphs and code blocks as-is.

function stripJsx(md) {
  md = md.replace(/^\s*import\s+[^;\n]+\s+from\s+['"][^'"]+['"];?\s*$/gm, '');
  md = md.replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');
  // Mermaid uses template-literal props with <br/> inside — match up to `} />
  md = md.replace(/<Mermaid\b\s+code=\{`[\s\S]*?`\}\s*\/>/g, '');
  md = md.replace(/<Mermaid\b[\s\S]*?<\/Mermaid>/g, '');
  md = unwrapComponents(md);
  md = md.replace(/<[A-Z][A-Za-z0-9]*\s*[^>]*\/>/g, '');
  md = md.replace(/<([A-Z][A-Za-z0-9]*)\s*[^>]*>[\s\S]*?<\/\1>/g, '');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<\/?(?:details|summary)[^>]*>/gi, '');
  // Known HTML tags only — preserve placeholder notation like <pubKeyHash>, <sig>
  md = md.replace(/<\/?(?:div|span|p|em|strong|i|b|u|a|ul|ol|li|h[1-6]|table|tr|td|th|tbody|thead|tfoot|pre|blockquote|section|article|nav|aside|header|footer|main|figure|figcaption|sub|sup|small|code|kbd|mark|hr|img|dl|dt|dd)\b[^>]*>/gi, '');
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
  // ⚠ 슬러그의 `/`(dharma 의 `concepts/anatta`)는 build-gopher 의 safeSlug 와 같은 규칙으로 `_` 가 된다 — 파일 이름이 그렇다.
  // 사이트 안 글 링크는 gopher 선택자(.txt)로 — HTML 미러 경로(/learn/ja/…/slug/)는 gopher 에서 따라갈 수 없다.
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, label, url) =>
    `${label} [${url.replace(/^(\/learn\/[a-z]{2}\/[^/#?]+\/)([^#?]*[^/#?])\/?(?=$|[#?])/, (m, head, slug) => `${head}${slug.replace(/[^A-Za-z0-9._-]/g, '_')}.txt`)}]`);
  return text;
}

const WRAP = 70;
const CJK_RE = /[\u3000-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]/;

function visualWidth(s) {
  let w = 0;
  for (const ch of s) w += CJK_RE.test(ch) ? 2 : 1;
  return w;
}

// 줄 머리에 올 수 없는 글자(금칙). 마침표가 홀로 줄에 서면 RFC 1436 의 «본문 끝» 이 된다.
const NO_LINE_START = /^[.,!?:;)\]}%\u3001\u3002\uFF0C\uFF0E\uFF01\uFF1F\uFF1A\uFF1B\uFF09\u300D\u300F\u3011\u3009\u300B\u2019\u201D\u2026\u30FB]/;

function wrapCJK(line, width) {
  // CJK 는 글자 단위(폭 2)로 끊되, ASCII 연속 구간(URL·영단어·숫자)은 한 덩어리로 넘긴다.
  const out = [];
  let buf = '';
  let vw = 0;
  for (const tok of line.match(/[\x21-\x7e]+|[\s\S]/gu) || []) {
    const tw = visualWidth(tok);
    if (vw + tw > width && buf && !NO_LINE_START.test(tok)) {
      out.push(buf.trimEnd());
      if (tok === ' ') { buf = ''; vw = 0; continue; }
      buf = tok;
      vw = tw;
    } else {
      buf += tok;
      vw += tw;
    }
  }
  if (buf.trim()) out.push(buf.trimEnd());
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

// 홀로 선 `.` 줄은 gopher 에서 본문 끝이다 — 앞에 공백을 둬 무해하게.
export function guardLoneDot(text) {
  return text.replace(/^\.$/gm, ' .');
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
      out.push({ code: '    ' + line });
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

  // 코드 블록 줄은 접지 않는다(들여쓰기와 명령이 쪼개진다).
  // 인용(`  | `)과 목록의 이어지는 줄은 머리·들여쓰기를 잃지 않게 한다.
  const wrapped = out.map((l) => {
    if (typeof l !== 'string') return l.code;
    const m = /^(\s*\| |\s*\* |\s+)(.*)$/.exec(l);
    if (!m || !m[2]) return wrap(l, WRAP);
    const head = m[1];
    const cont = head.includes('|') ? head : ' '.repeat(head.length);
    return wrap(m[2], WRAP - head.length).split('\n').map((w, i) => (i ? cont : head) + w).join('\n');
  });
  const text = wrapped.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return guardLoneDot(text) + '\n';
}
