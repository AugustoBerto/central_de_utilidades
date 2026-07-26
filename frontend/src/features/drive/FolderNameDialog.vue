<script setup>
import { X } from 'lucide-vue-next';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import AppButton from '@/components/base/AppButton.vue';

const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  initialName: { type: String, default: '' },
  submitLabel: { type: String, default: 'Salvar' },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' }
});

const emit = defineEmits(['close', 'submit']);
const dialog = ref(null);
const name = ref(props.initialName);
const input = ref(null);
const previouslyFocused = document.activeElement;

function close() {
  if (!props.loading) emit('close');
}

function submit() {
  const normalized = name.value.trim();
  if (normalized) emit('submit', normalized);
}

function focusableElements() {
  return Array.from(
    dialog.value?.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    ) ?? []
  );
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== 'Tab') return;
  const elements = focusableElements();
  if (!elements.length) return;
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(async () => {
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKeydown);
  await nextTick();
  input.value?.focus();
  input.value?.select();
});

onBeforeUnmount(() => {
  document.body.style.overflow = '';
  document.removeEventListener('keydown', onKeydown);
  requestAnimationFrame(() => previouslyFocused?.focus?.());
});
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" @mousedown.self="close">
      <section ref="dialog" class="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="folder-dialog-title" :aria-describedby="description ? 'folder-dialog-description' : undefined">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 id="folder-dialog-title" class="text-lg font-semibold">{{ title }}</h2>
            <p v-if="description" id="folder-dialog-description" class="mt-1 text-sm text-muted">{{ description }}</p>
          </div>
          <button type="button" class="rounded-md p-2 text-muted hover:bg-elevated hover:text-foreground" aria-label="Fechar" :disabled="loading" @click="close">
            <X :size="18" aria-hidden="true" />
          </button>
        </div>

        <form class="mt-5" @submit.prevent="submit">
          <label class="block text-sm font-medium" for="folder-name">Nome da pasta</label>
          <input id="folder-name" ref="input" v-model="name" class="mt-2 min-h-11 w-full rounded-md border border-border bg-canvas px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" maxlength="255" autocomplete="off" required />
          <p v-if="error" class="mt-2 text-sm text-red-500" role="alert">{{ error }}</p>
          <div class="mt-5 flex flex-wrap justify-end gap-2">
            <AppButton variant="secondary" :disabled="loading" @click="close">Cancelar</AppButton>
            <AppButton type="submit" :loading="loading" :disabled="!name.trim()">{{ submitLabel }}</AppButton>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>
