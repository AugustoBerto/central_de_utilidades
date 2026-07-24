import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import App from './App.vue';

describe('App', () => {
  it('renders the active router view', () => {
    const wrapper = mount(App, {
      global: {
        stubs: { RouterView: { template: '<div data-test="router-view" />' } }
      }
    });

    expect(wrapper.get('[data-test="router-view"]').exists()).toBe(true);
  });
});
