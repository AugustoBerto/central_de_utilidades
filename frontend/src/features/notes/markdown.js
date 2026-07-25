function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function inline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\+\+(.+?)\+\+/g, '<u>$1</u>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[size=(small|large|xlarge)\](.+?)\[\/size\]/g, (_match, size, text) =>
      `<span class="note-size-${size}">${text}</span>`
    );
}

function highlightCode(code, language) {
  const escaped = escapeHtml(code);
  const lang = String(language || '').toLowerCase();

  if (['bash', 'sh', 'shell', 'zsh'].includes(lang)) {
    return escaped
      .replace(/(^|\s)(#[^\n]*)/g, '$1<span class="tok-comment">$2</span>')
      .replace(/(^|\s)(sudo|cd|ls|pwd|mkdir|rm|cp|mv|cat|grep|find|chmod|chown|npm|npx|git|docker|systemctl)(?=\s|$)/g, '$1<span class="tok-keyword">$2</span>')
      .replace(/(--?[\w-]+)/g, '<span class="tok-attr">$1</span>')
      .replace(/(&quot;[^&]*?&quot;|'[^']*?')/g, '<span class="tok-string">$1</span>');
  }

  if (['js', 'javascript', 'ts', 'typescript', 'vue'].includes(lang)) {
    return escaped
      .replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, '<span class="tok-comment">$1</span>')
      .replace(/\b(const|let|var|function|return|if|else|for|while|class|new|import|from|export|async|await|try|catch|throw|true|false|null|undefined)\b/g, '<span class="tok-keyword">$1</span>')
      .replace(/(&quot;[^&]*?&quot;|'[^']*?'|`[^`]*?`)/g, '<span class="tok-string">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>');
  }

  if (lang === 'json') {
    return escaped
      .replace(/(&quot;[^&]*?&quot;)(\s*:)?/g, (_match, text, colon) => colon ? `<span class="tok-property">${text}</span>${colon}` : `<span class="tok-string">${text}</span>`)
      .replace(/\b(true|false|null)\b/g, '<span class="tok-keyword">$1</span>')
      .replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>');
  }

  if (['html', 'xml'].includes(lang)) {
    return escaped
      .replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="tok-tag">$2</span>')
      .replace(/([\w-]+)=(&quot;[^&]*?&quot;)/g, '<span class="tok-attr">$1</span>=<span class="tok-string">$2</span>');
  }

  if (lang === 'css') {
    return escaped
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-comment">$1</span>')
      .replace(/([\w-]+)(\s*:)/g, '<span class="tok-property">$1</span>$2')
      .replace(/(#[0-9a-fA-F]{3,8}|\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw)?\b)/g, '<span class="tok-number">$1</span>');
  }

  if (lang === 'sql') {
    return escaped
      .replace(/\b(select|from|where|insert|into|update|delete|create|table|join|left|right|inner|outer|on|as|and|or|order|by|group|limit|values|set|null|not|primary|key)\b/gi, '<span class="tok-keyword">$1</span>')
      .replace(/(&quot;[^&]*?&quot;|'[^']*?')/g, '<span class="tok-string">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>');
  }

  if (['yaml', 'yml'].includes(lang)) {
    return escaped
      .replace(/(^|\n)(\s*)([\w.-]+)(:)/g, '$1$2<span class="tok-property">$3</span>$4')
      .replace(/(^|\s)(#[^\n]*)/g, '$1<span class="tok-comment">$2</span>')
      .replace(/(&quot;[^&]*?&quot;|'[^']*?')/g, '<span class="tok-string">$1</span>');
  }

  if (lang === 'dockerfile') {
    return escaped.replace(/^(FROM|RUN|COPY|ADD|WORKDIR|CMD|ENTRYPOINT|ENV|EXPOSE|ARG|LABEL|USER|VOLUME)(?=\s)/gim, '<span class="tok-keyword">$1</span>');
  }

  if (lang === 'nginx') {
    return escaped
      .replace(/(^|\n)(\s*)(server|location|listen|server_name|proxy_pass|root|index|try_files)(?=\s)/g, '$1$2<span class="tok-keyword">$3</span>')
      .replace(/(^|\s)(#[^\n]*)/g, '$1<span class="tok-comment">$2</span>');
  }

  return escaped;
}

function renderTable(lines) {
  if (lines.length < 2 || !/^\s*\|?\s*:?-{3,}/.test(lines[1])) return null;
  const rows = lines.map((line) => line.replace(/^\s*\||\|\s*$/g, '').split('|').map((cell) => cell.trim()));
  const header = rows[0];
  const body = rows.slice(2);
  return `<div class="note-table-wrap"><table><thead><tr>${header.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function renderMarkdown(content) {
  const lines = String(content).replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let index = 0;
  let codeBlockIndex = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      const blockId = `code-${++codeBlockIndex}`;
      output.push(`<section class="note-code-block" data-block-id="${blockId}"><header><span>${escapeHtml(language || 'texto')}</span><button type="button" class="note-code-copy">Copiar</button></header><pre><code class="language-${escapeHtml(language || 'text')}">${highlightCode(code.join('\n'), language)}</code></pre></section>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      output.push('<hr>');
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ''));
      output.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        const raw = lines[index++].replace(/^\s*[-*]\s+/, '');
        const task = raw.match(/^\[([ xX])\]\s*(.*)$/);
        items.push(task ? `<li class="note-task"><input type="checkbox" disabled ${task[1].toLowerCase() === 'x' ? 'checked' : ''}>${inline(task[2])}</li>` : `<li>${inline(raw)}</li>`);
      }
      output.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) items.push(`<li>${inline(lines[index++].replace(/^\s*\d+\.\s+/, ''))}</li>`);
      output.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length) {
      const tableLines = [];
      let cursor = index;
      while (cursor < lines.length && lines[cursor].includes('|') && lines[cursor].trim()) tableLines.push(lines[cursor++]);
      const table = renderTable(tableLines);
      if (table) {
        output.push(table);
        index = cursor;
        continue;
      }
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,6})\s+|^```|^>\s?|^\s*[-*]\s+|^\s*\d+\.\s+/.test(lines[index])) paragraph.push(lines[index++]);
    output.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
  }

  return output.join('');
}

export function notePreview(content, limit = 220) {
  const source = String(content);
  const codeLabels = [];
  const withoutCode = source.replace(/```([^\n]*)\n?[\s\S]*?```/g, (_match, language) => {
    const label = language.trim();
    codeLabels.push(label ? `Trecho de código: ${label}` : 'Trecho de código');
    return ' ';
  });
  const text = withoutCode
    .replace(/^(#{1,6}|>|\s*[-*]|\s*\d+\.)\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\*\*|\*|~~|\+\+|`|\[size=(?:small|large|xlarge)\]|\[\/size\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const combined = [text, ...codeLabels].filter(Boolean).join(' · ');
  return combined.length > limit ? `${combined.slice(0, limit).trimEnd()}…` : combined;
}

export function excerpt(content, limit = 180) {
  return notePreview(content, limit);
}
