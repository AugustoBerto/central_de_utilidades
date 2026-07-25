<script setup>
/* eslint-disable vue/no-v-html -- renderMarkdown escapa toda entrada antes de produzir HTML. */
import { computed, onBeforeUnmount } from 'vue';

import { renderMarkdown } from '@/features/notes/markdown';

const props = defineProps({
  content: { type: String, default: '' }
});

const html = computed(() => renderMarkdown(props.content));
let resetTimer;

async function onClick(event) {
  const button = event.target.closest('.note-code-copy');
  if (!button) return;
  const wrapper = button.closest('.note-code-block');
  const code = wrapper?.querySelector('code')?.textContent ?? '';
  try {
    await navigator.clipboard.writeText(code);
    button.textContent = 'Copiado';
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      button.textContent = 'Copiar';
    }, 1600);
  } catch {
    button.textContent = 'Falhou';
    window.setTimeout(() => { button.textContent = 'Copiar'; }, 1600);
  }
}

onBeforeUnmount(() => window.clearTimeout(resetTimer));
</script>

<template>
  <article class="note-markdown" @click="onClick" v-html="html" />
</template>
