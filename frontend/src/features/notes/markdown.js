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
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\+\+(.+?)\+\+/g, '<u>$1</u>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[size=(small|large|xlarge)\](.+?)\[\/size\]/g, (_match, size, text) =>
      `<span class="note-size-${size}">${text}</span>`
    );
}

export function renderMarkdown(content) {
  return String(content)
    .split(/\n{2,}/)
    .map((block) => {
      const heading = block.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length + 2;
        return `<h${level}>${inline(heading[2])}</h${level}>`;
      }
      const list = block.split('\n');
      if (list.every((line) => /^[-*]\s+/.test(line)))
        return `<ul>${list.map((line) => `<li>${inline(line.slice(2))}</li>`).join('')}</ul>`;
      return `<p>${list.map(inline).join('<br>')}</p>`;
    })
    .join('');
}

export function excerpt(content, limit = 180) {
  const text = String(content)
    .replace(/^(#{1,3})\s+/gm, '')
    .replace(/\*\*|\*|\+\+|\[size=(?:small|large|xlarge)\]|\[\/size\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}
