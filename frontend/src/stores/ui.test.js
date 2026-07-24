import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from './ui';

describe('ui store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('opens and closes mobile navigation', () => {
    const store = useUiStore();

    store.openMobileNavigation();
    expect(store.mobileNavigationOpen).toBe(true);

    store.closeMobileNavigation();
    expect(store.mobileNavigationOpen).toBe(false);
  });
});
