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
      output.push(`<pre><code${language ? ` class="language-${escapeHtml(language)}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`);
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

export function excerpt(content, limit = 180) {
  const text = String(content)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^(#{1,6}|>|\s*[-*]|\s*\d+\.)\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|\*|~~|\+\+|`|\[size=(?:small|large|xlarge)\]|\[\/size\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}
