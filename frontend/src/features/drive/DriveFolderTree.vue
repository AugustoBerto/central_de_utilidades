<script setup>
import { Folder, Home, X } from 'lucide-vue-next';

const props = defineProps({
  open: { type: Boolean, default: false },
  folders: { type: Array, required: true },
  currentFolderId: { type: Number, default: null },
  dropTargetFolderId: { type: Number, default: null }
});
const emit = defineEmits([
  'close',
  'open-folder',
  'drag-over',
  'drag-leave',
  'drop'
]);

function rowStyle(folder) {
  return { paddingLeft: `${0.75 + (folder.depth ?? 0) * 1.1}rem` };
}
</script>

<template>
  <aside
    v-if="open"
    class="absolute right-0 top-full z-30 mt-2 flex max-h-[28rem] w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
    aria-label="Árvore de pastas"
  >
    <header class="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
      <div>
        <h3 class="text-sm font-semibold">Pastas</h3>
        <p class="text-xs text-muted">Abra ou solte itens em um destino.</p>
      </div>
      <button type="button" class="rounded-md p-2 text-muted hover:bg-elevated hover:text-foreground" aria-label="Fechar árvore de pastas" @click="emit('close')">
        <X :size="17" aria-hidden="true" />
      </button>
    </header>
    <div class="min-h-0 overflow-y-auto p-2">
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-elevated"
        :class="[
          currentFolderId === null ? 'font-medium text-foreground' : 'text-muted',
          dropTargetFolderId === 0 ? 'bg-accent/15 ring-2 ring-inset ring-accent' : ''
        ]"
        @click="emit('open-folder', null)"
        @dragover.prevent.stop="emit('drag-over', null, $event)"
        @dragleave.stop="emit('drag-leave', null, $event)"
        @drop.prevent.stop="emit('drop', null, $event)"
      >
        <Home :size="17" aria-hidden="true" />Meu Drive
      </button>
      <button
        v-for="folder in folders"
        :key="folder.id"
        type="button"
        class="mt-0.5 flex w-full items-center gap-2 rounded-md py-2 pr-3 text-left text-sm hover:bg-elevated"
        :class="[
          currentFolderId === folder.id ? 'font-medium text-foreground' : 'text-muted',
          dropTargetFolderId === folder.id ? 'bg-accent/15 ring-2 ring-inset ring-accent' : ''
        ]"
        :style="rowStyle(folder)"
        @click="emit('open-folder', folder)"
        @dragover.prevent.stop="emit('drag-over', folder, $event)"
        @dragleave.stop="emit('drag-leave', folder, $event)"
        @drop.prevent.stop="emit('drop', folder, $event)"
      >
        <Folder class="shrink-0 text-accent" :size="17" aria-hidden="true" />
        <span class="truncate" :title="folder.path">{{ folder.name }}</span>
      </button>
    </div>
  </aside>
</template>
