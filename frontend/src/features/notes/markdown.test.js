import { describe, expect, it } from 'vitest';

import { excerpt, renderMarkdown } from './markdown';

describe('Markdown de notas', () => {
  it('formata marcações permitidas e escapa HTML arbitrário', () => {
    expect(renderMarkdown('**forte** e ++sublinhado++ <script>alert(1)</script>')).toContain(
      '<strong>forte</strong>'
    );
    expect(renderMarkdown('<script>alert(1)</script>')).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('produz um resumo textual curto para a biblioteca', () => {
    expect(excerpt('## Título\n\n**Conteúdo**')).toBe('Título Conteúdo');
  });
});
