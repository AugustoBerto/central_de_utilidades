import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import FileOrganizeDialog from './FileOrganizeDialog.vue';

describe('FileOrganizeDialog', () => {
  it('envia novo nome e pasta de destino', async () => {
    const wrapper = mount(FileOrganizeDialog, {
      props: {
        file: { id: 1, originalName: 'relatorio.pdf', folderId: null },
        folders: [{ id: 4, path: 'Projetos / 2026', depth: 1 }]
      },
      global: { stubs: { Teleport: true } }
    });

    await wrapper.get('#file-organize-name').setValue('relatorio-final.pdf');
    await wrapper.get('#file-organize-folder').setValue('4');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]).toEqual([
      { originalName: 'relatorio-final.pdf', folderId: 4 }
    ]);
  });
});
