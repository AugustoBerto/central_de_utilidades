import { ref } from 'vue';
import { describe, expect, it } from 'vitest';

import { driveItemKey, useDriveSelection } from './useDriveSelection';

const items = [
  { kind: 'folder', id: 1, name: 'A' },
  { kind: 'file', id: 2, name: 'B' },
  { kind: 'file', id: 3, name: 'C' },
  { kind: 'file', id: 4, name: 'D' }
];

describe('useDriveSelection', () => {
  it('seleciona um item e alterna itens com Ctrl/Cmd', () => {
    const model = useDriveSelection(ref(items));

    model.select(items[1], 1);
    model.select(items[3], 3, { ctrlKey: true });

    expect([...model.selectedKeys.value]).toEqual([
      driveItemKey(items[1]),
      driveItemKey(items[3])
    ]);
    model.select(items[1], 1, { metaKey: true });
    expect([...model.selectedKeys.value]).toEqual([driveItemKey(items[3])]);
  });

  it('seleciona intervalos com Shift', () => {
    const model = useDriveSelection(ref(items));

    model.select(items[1], 1);
    model.select(items[3], 3, { shiftKey: true });

    expect(model.selectedItems.value.map((item) => item.name)).toEqual(['B', 'C', 'D']);
  });

  it('seleciona e limpa toda a página', () => {
    const model = useDriveSelection(ref(items));

    model.togglePage();
    expect(model.allPageSelected.value).toBe(true);
    expect(model.selectedItems.value).toHaveLength(4);

    model.togglePage();
    expect(model.selectedItems.value).toHaveLength(0);
  });
});
