import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AppButton from './AppButton.vue';

describe('AppButton', () => {
  it('disables interaction while loading', () => {
    const wrapper = mount(AppButton, {
      props: { loading: true },
      slots: { default: 'Salvar' }
    });

    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Salvar');
  });
});
