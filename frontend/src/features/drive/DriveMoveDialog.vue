<script setup>
import { FolderInput } from 'lucide-vue-next';
import { computed, ref } from 'vue';

import AppButton from '@/components/base/AppButton.vue';
import AppModal from '@/components/base/AppModal.vue';

const props = defineProps({
  items: { type: Array, required: true },
  folders: { type: Array, required: true },
  currentFolderId: { type: Number, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' }
});
const emit = defineEmits(['close', 'submit']);
const destination = ref(
  props.currentFolderId === null || props.currentFolderId === undefined
    ? ''
    : String(props.currentFolderId)
);

const selectedFolders = computed(() =>
  props.items.filter((item) => item.kind === 'folder')
);

function invalidDestination(folder) {
  return selectedFolders.value.some(
    (item) =>
      item.id === folder.id ||
      folder.path === item.itemPath ||
      folder.path?.startsWith(`${item.itemPath} / `)
  );
}

function submit() {
  emit('submit', destination.value === '' ? null : Number(destination.value));
}
</script>

<template>
  <AppModal
    title="Mover itens"
    aria-label="Escolher pasta de destino"
    max-width-class="max-w-md"
    :close-on-escape="!loading"
    @close="!loading && emit('close')"
  >
    <form class="space-y-5 p-5 sm:p-6" @submit.prevent="submit">
      <div class="flex gap-3">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <FolderInput :size="20" aria-hidden="true" />
        </span>
        <div>
          <p class="font-medium">{{ items.length }} {{ items.length === 1 ? 'item selecionado' : 'itens selecionados' }}</p>
          <p class="mt-1 text-sm text-muted">A operação só será aplicada se todos os itens puderem ser movidos.</p>
        </div>
      </div>

      <label class="block text-sm font-medium">
        Pasta de destino
        <select
          v-model="destination"
          class="mt-2 min-h-11 w-full rounded-md border border-border bg-canvas px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          :disabled="loading"
        >
          <option value="">Meu Drive</option>
          <option
            v-for="folder in folders"
            :key="folder.id"
            :value="String(folder.id)"
            :disabled="invalidDestination(folder)"
          >
            {{ folder.path }}
          </option>
        </select>
      </label>

      <p v-if="error" class="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500" role="alert">
        {{ error }}
      </p>
    </form>
    <template #footer>
      <div class="flex justify-end gap-2">
        <AppButton variant="secondary" :disabled="loading" @click="emit('close')">Cancelar</AppButton>
        <AppButton :loading="loading" @click="submit">Mover</AppButton>
      </div>
    </template>
  </AppModal>
</template>
