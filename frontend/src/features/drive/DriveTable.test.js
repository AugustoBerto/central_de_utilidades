import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import DriveTable from './DriveTable.vue';

const items = [
  {
    kind: 'folder',
    id: 1,
    name: 'Documentos',
    folderId: null,
    folderPath: '',
    typeLabel: 'Pasta',
    sizeBytes: null,
    updatedAt: '2026-07-26T12:00:00.000Z'
  },
  {
    kind: 'file',
    id: 2,
    name: 'relatório.pdf',
    folderId: null,
    folderPath: '',
    mimeType: 'application/pdf',
    typeLabel: 'PDF',
    sizeBytes: 2048,
    previewAvailable: true,
    updatedAt: '2026-07-26T13:00:00.000Z'
  }
];

describe('DriveTable', () => {
  it('renderiza itens sem botões de ação repetidos por linha', () => {
    const wrapper = mount(DriveTable, {
      props: {
        items,
        selectedKeys: new Set(),
        sort: 'name:asc'
      }
    });

    expect(wrapper.get('table').exists()).toBe(true);
    expect(wrapper.text()).toContain('Documentos');
    expect(wrapper.text()).toContain('relatório.pdf');
    expect(wrapper.text()).not.toContain('Excluir');
    expect(wrapper.text()).not.toContain('Baixar');
    expect(wrapper.text()).not.toContain('Organizar');
  });

  it('emite ordenação por coluna e seleção da linha', async () => {
    const wrapper = mount(DriveTable, {
      props: {
        items,
        selectedKeys: new Set(),
        sort: 'name:asc'
      }
    });

    const sizeHeader = wrapper.findAll('thead button').find((button) =>
      button.text().includes('Tamanho')
    );
    await sizeHeader.trigger('click');
    expect(wrapper.emitted('sort')[0]).toEqual(['size']);

    const rows = wrapper.findAll('tbody tr');
    await rows[1].trigger('click');
    expect(wrapper.emitted('select')[0][0]).toMatchObject({ kind: 'file', id: 2 });

    await rows[0].trigger('dblclick');
    expect(wrapper.emitted('activate')[0][0]).toMatchObject({ kind: 'folder', id: 1 });
  });

  it('expõe aria-sort na coluna ativa', () => {
    const wrapper = mount(DriveTable, {
      props: {
        items,
        selectedKeys: new Set(),
        sort: 'size:desc'
      }
    });

    const headers = wrapper.findAll('th');
    expect(headers.find((header) => header.text().includes('Tamanho')).attributes('aria-sort'))
      .toBe('descending');
  });
});
