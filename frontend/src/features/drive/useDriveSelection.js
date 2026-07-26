import { computed, ref } from 'vue';

export function driveItemKey(item) {
  return `${item.kind}:${item.id}`;
}

export function useDriveSelection(items) {
  const selectedKeys = ref(new Set());
  const anchorIndex = ref(null);

  const selectedItems = computed(() =>
    items.value.filter((item) => selectedKeys.value.has(driveItemKey(item)))
  );
  const allPageSelected = computed(
    () => items.value.length > 0 && items.value.every((item) => selectedKeys.value.has(driveItemKey(item)))
  );
  const somePageSelected = computed(
    () => !allPageSelected.value && items.value.some((item) => selectedKeys.value.has(driveItemKey(item)))
  );

  function replace(next) {
    selectedKeys.value = next;
  }

  function clear() {
    replace(new Set());
    anchorIndex.value = null;
  }

  function isSelected(item) {
    return selectedKeys.value.has(driveItemKey(item));
  }

  function selectOnly(item, index = null) {
    replace(new Set([driveItemKey(item)]));
    anchorIndex.value = index;
  }

  function select(item, index, event = {}) {
    const key = driveItemKey(item);
    const additive = Boolean(event.ctrlKey || event.metaKey);
    if (event.shiftKey && anchorIndex.value !== null) {
      const start = Math.min(anchorIndex.value, index);
      const end = Math.max(anchorIndex.value, index);
      const next = additive ? new Set(selectedKeys.value) : new Set();
      for (const candidate of items.value.slice(start, end + 1))
        next.add(driveItemKey(candidate));
      replace(next);
      return;
    }

    if (additive) {
      const next = new Set(selectedKeys.value);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      replace(next);
      anchorIndex.value = index;
      return;
    }

    selectOnly(item, index);
  }

  function toggle(item, index) {
    select(item, index, { ctrlKey: true });
  }

  function togglePage() {
    if (allPageSelected.value) {
      clear();
      return;
    }
    replace(new Set(items.value.map(driveItemKey)));
    anchorIndex.value = items.value.length ? 0 : null;
  }

  return {
    selectedKeys,
    selectedItems,
    allPageSelected,
    somePageSelected,
    clear,
    isSelected,
    select,
    selectOnly,
    toggle,
    togglePage
  };
}
