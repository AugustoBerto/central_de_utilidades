<script setup>
import { FolderInput, X } from 'lucide-vue-next';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import AppButton from '@/components/base/AppButton.vue';

const props = defineProps({
  file: { type: Object, required: true },
  folders: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' }
});

const emit = defineEmits(['close', 'submit']);
const dialog = ref(null);
const nameInput = ref(null);
const name = ref(props.file.originalName);
const folderId = ref(props.file.folderId === null ? '' : String(props.file.folderId));
const previouslyFocused = document.activeElement;

function close() {
  if (!props.loading) emit('close');
}

function submit() {
  const normalized = name.value.trim();
  if (!normalized) return;
  emit('submit', {
    originalName: normalized,
    folderId: folderId.value === '' ? null : Number(folderId.value)
  });
}

function focusableElements() {
  return Array.from(
    dialog.value?.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
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
  nameInput.value?.focus();
  nameInput.value?.select();
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
      <section ref="dialog" class="w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="file-organize-title" aria-describedby="file-organize-description">
        <div class="flex items-start justify-between gap-4">
          <div class="flex min-w-0 gap-3">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <FolderInput :size="20" aria-hidden="true" />
            </span>
            <div class="min-w-0">
              <h2 id="file-organize-title" class="text-lg font-semibold">Organizar arquivo</h2>
              <p id="file-organize-description" class="mt-1 text-sm text-muted">
                Renomeie o arquivo ou escolha outra pasta de destino.
              </p>
            </div>
          </div>
          <button type="button" class="rounded-md p-2 text-muted hover:bg-elevated hover:text-foreground" aria-label="Fechar" :disabled="loading" @click="close">
            <X :size="18" aria-hidden="true" />
          </button>
        </div>

        <form class="mt-5 space-y-4" @submit.prevent="submit">
          <label class="block text-sm font-medium" for="file-organize-name">
            Nome do arquivo
            <input id="file-organize-name" ref="nameInput" v-model="name" class="mt-2 min-h-11 w-full rounded-md border border-border bg-canvas px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" maxlength="255" autocomplete="off" required />
          </label>

          <label class="block text-sm font-medium" for="file-organize-folder">
            Pasta de destino
            <select id="file-organize-folder" v-model="folderId" class="mt-2 min-h-11 w-full rounded-md border border-border bg-canvas px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20">
              <option value="">Meu Drive</option>
              <option v-for="folder in folders" :key="folder.id" :value="String(folder.id)">
                {{ folder.path }}
              </option>
            </select>
          </label>

          <p v-if="error" class="text-sm text-red-500" role="alert">{{ error }}</p>

          <div class="flex flex-wrap justify-end gap-2">
            <AppButton variant="secondary" :disabled="loading" @click="close">Cancelar</AppButton>
            <AppButton type="submit" :loading="loading" :disabled="!name.trim()">Salvar alterações</AppButton>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>
