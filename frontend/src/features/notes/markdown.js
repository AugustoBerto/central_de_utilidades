import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdownLanguage from 'highlight.js/lib/languages/markdown';
import nginx from 'highlight.js/lib/languages/nginx';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import MarkdownIt from 'markdown-it';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdownLanguage);
hljs.registerLanguage('md', markdownLanguage);
hljs.registerLanguage('nginx', nginx);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('vue', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);

function legacyInlinePlugin(md) {
  md.inline.ruler.before('emphasis', 'underline', (state, silent) => {
    if (state.src.slice(state.pos, state.pos + 2) !== '++') return false;
    const end = state.src.indexOf('++', state.pos + 2);
    if (end < 0) return false;
    if (!silent) {
      state.push('underline_open', 'u', 1);
      const text = state.push('text', '', 0);
      text.content = state.src.slice(state.pos + 2, end);
      state.push('underline_close', 'u', -1);
    }
    state.pos = end + 2;
    return true;
  });

  md.inline.ruler.before('emphasis', 'legacy_size', (state, silent) => {
    const match = state.src.slice(state.pos).match(/^\[size=(small|large|xlarge)\]([\s\S]+?)\[\/size\]/);
    if (!match) return false;
    if (!silent) {
      const open = state.push('legacy_size_open', 'span', 1);
      open.attrSet('class', `note-size-${match[1]}`);
      const text = state.push('text', '', 0);
      text.content = match[2];
      state.push('legacy_size_close', 'span', -1);
    }
    state.pos += match[0].length;
    return true;
  });
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false
});

markdown.use(legacyInlinePlugin);

const defaultLinkOpen = markdown.renderer.rules.link_open
  ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));

markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index];
  token.attrSet('target', '_blank');
  token.attrSet('rel', 'noopener noreferrer');
  return defaultLinkOpen(tokens, index, options, env, self);
};

markdown.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index];
  const language = token.info.trim().split(/\s+/)[0].toLowerCase();
  const label = language || 'texto';
  const highlighted = language && hljs.getLanguage(language)
    ? hljs.highlight(token.content, { language, ignoreIllegals: true }).value
    : markdown.utils.escapeHtml(token.content);
  return `<section class="note-code-block"><header><span>${markdown.utils.escapeHtml(label)}</span><button type="button" class="note-code-copy">Copiar</button></header><pre><code class="hljs language-${markdown.utils.escapeHtml(language || 'text')}">${highlighted}</code></pre></section>`;
};

function sanitize(html) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'a', 'blockquote', 'br', 'button', 'code', 'del', 'div', 'em', 'h1', 'h2', 'h3',
      'h4', 'h5', 'h6', 'header', 'hr', 'input', 'li', 'ol', 'p', 'pre', 'section', 'span',
      'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul'
    ],
    ALLOWED_ATTR: ['checked', 'class', 'disabled', 'href', 'rel', 'target', 'type']
  });
}

export function renderMarkdown(content) {
  return sanitize(markdown.render(String(content ?? '')));
}

export function notePreview(content, limit = 220) {
  const codeLabels = [];
  const source = String(content ?? '').replace(/```([^\n]*)\n?[\s\S]*?```/g, (_match, language) => {
    const label = language.trim();
    codeLabels.push(label ? `Trecho de código: ${label}` : 'Trecho de código');
    return ' ';
  });

  const text = source
    .replace(/^(#{1,6}|>|\s*[-*+]|\s*\d+\.)\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\*\*|__|\*|_|~~|\+\+|`|\[size=(?:small|large|xlarge)\]|\[\/size\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const combined = [text, ...codeLabels].filter(Boolean).join(' · ');
  return combined.length > limit ? `${combined.slice(0, limit).trimEnd()}…` : combined;
}

export function excerpt(content, limit = 180) {
  return notePreview(content, limit);
}
