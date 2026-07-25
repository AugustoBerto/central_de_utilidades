<script setup>
import { computed, ref } from 'vue';

import { renderMarkdown } from '@/features/notes/markdown';

const props = defineProps({
  content: { type: String, default: '' }
});

const copiedBlock = ref(null);
const html = computed(() => renderMarkdown(props.content));
let resetTimer;

async function onClick(event) {
  const button = event.target.closest('.note-code-copy');
  if (!button) return;
  const wrapper = button.closest('.note-code-block');
  const code = wrapper?.querySelector('code')?.textContent ?? '';
  try {
    await navigator.clipboard.writeText(code);
    copiedBlock.value = wrapper?.dataset.blockId ?? null;
    button.textContent = 'Copiado';
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      button.textContent = 'Copiar';
      copiedBlock.value = null;
    }, 1600);
  } catch {
    button.textContent = 'Falhou';
    window.setTimeout(() => { button.textContent = 'Copiar'; }, 1600);
  }
}
</script>

<template>
  <!-- O HTML é produzido por um renderizador que escapa toda entrada do usuário. -->
  <article class="note-markdown" v-html="html" @click="onClick" />
</template>
