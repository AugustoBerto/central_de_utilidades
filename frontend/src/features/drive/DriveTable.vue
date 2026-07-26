<script setup>
import {
  ArrowDown,
  ArrowUp,
  FileAudio,
  FileText,
  FileVideo,
  Folder,
  Image as ImageIcon
} from 'lucide-vue-next';
import { ref, watchEffect } from 'vue';

import { formatBytes } from '@/features/dashboard/format';
import { driveItemKey } from './useDriveSelection';

const props = defineProps({
  items: { type: Array, required: true },
  selectedKeys: { type: Object, required: true },
  allSelected: { type: Boolean, default: false },
  someSelected: { type: Boolean, default: false },
  sort: { type: String, default: 'name:asc' },
  searching: { type: Boolean, default: false },
  dropTargetFolderId: { type: Number, default: null }
});

const emit = defineEmits([
  'select',
  'toggle',
  'toggle-page',
  'activate',
  'sort',
  'drag-start',
  'drag-end',
  'drag-over-folder',
  'drag-leave-folder',
  'drop-folder'
]);
const selectAll = ref(null);

watchEffect(() => {
  if (selectAll.value) selectAll.value.indeterminate = props.someSelected;
});

function iconFor(item) {
  if (item.kind === 'folder') return Folder;
  if (item.mimeType?.startsWith('image/')) return ImageIcon;
  if (item.mimeType?.startsWith('audio/')) return FileAudio;
  if (item.mimeType?.startsWith('video/')) return FileVideo;
  return FileText;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function sortState(field) {
  const [active, order] = props.sort.split(':');
  return active === field ? order : null;
}

function ariaSort(field) {
  const state = sortState(field);
  if (state === 'asc') return 'ascending';
  if (state === 'desc') return 'descending';
  return 'none';
}

function onFolderDragOver(event, item) {
  if (item.kind !== 'folder') return;
  emit('drag-over-folder', item, event);
}

function onFolderDragLeave(event, item) {
  if (item.kind !== 'folder') return;
  emit('drag-leave-folder', item, event);
}

function onFolderDrop(event, item) {
  if (item.kind !== 'folder') return;
  emit('drop-folder', item, event);
}
</script>

<template>
  <div class="min-h-0 overflow-auto">
    <table class="w-full min-w-[46rem] border-separate border-spacing-0 text-sm">
      <thead class="sticky top-0 z-10 bg-surface">
        <tr class="text-left text-xs font-medium text-muted">
          <th class="w-12 border-b border-border px-3 py-2.5">
            <label class="grid size-7 place-items-center rounded hover:bg-elevated">
              <span class="sr-only">Selecionar todos os itens desta página</span>
              <input
                ref="selectAll"
                type="checkbox"
                class="size-4 rounded border-border"
                :checked="allSelected"
                @change="emit('toggle-page')"
              />
            </label>
          </th>
          <th class="border-b border-border px-3 py-2.5" :aria-sort="ariaSort('name')">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-elevated hover:text-foreground"
              @click="emit('sort', 'name')"
            >
              Nome
              <ArrowUp v-if="sortState('name') === 'asc'" :size="13" aria-hidden="true" />
              <ArrowDown v-else-if="sortState('name') === 'desc'" :size="13" aria-hidden="true" />
            </button>
          </th>
          <th
            class="hidden w-44 border-b border-border px-3 py-2.5 md:table-cell"
            :aria-sort="ariaSort('updatedAt')"
          >
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-elevated hover:text-foreground"
              @click="emit('sort', 'updatedAt')"
            >
              Modificado
              <ArrowUp v-if="sortState('updatedAt') === 'asc'" :size="13" aria-hidden="true" />
              <ArrowDown v-else-if="sortState('updatedAt') === 'desc'" :size="13" aria-hidden="true" />
            </button>
          </th>
          <th
            class="hidden w-32 border-b border-border px-3 py-2.5 lg:table-cell"
            :aria-sort="ariaSort('type')"
          >
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-elevated hover:text-foreground"
              @click="emit('sort', 'type')"
            >
              Tipo
              <ArrowUp v-if="sortState('type') === 'asc'" :size="13" aria-hidden="true" />
              <ArrowDown v-else-if="sortState('type') === 'desc'" :size="13" aria-hidden="true" />
            </button>
          </th>
          <th
            class="hidden w-32 border-b border-border px-3 py-2.5 text-right sm:table-cell"
            :aria-sort="ariaSort('size')"
          >
            <button
              type="button"
              class="ml-auto inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-elevated hover:text-foreground"
              @click="emit('sort', 'size')"
            >
              Tamanho
              <ArrowUp v-if="sortState('size') === 'asc'" :size="13" aria-hidden="true" />
              <ArrowDown v-else-if="sortState('size') === 'desc'" :size="13" aria-hidden="true" />
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(item, index) in items"
          :key="driveItemKey(item)"
          draggable="true"
          class="group cursor-default outline-none transition-colors"
          :class="[
            selectedKeys.has(driveItemKey(item)) ? 'bg-accent/10' : 'hover:bg-elevated/70',
            item.kind === 'folder' && dropTargetFolderId === item.id
              ? 'bg-accent/20 ring-2 ring-inset ring-accent'
              : ''
          ]"
          :aria-selected="selectedKeys.has(driveItemKey(item))"
          @click="emit('select', item, index, $event)"
          @dblclick="emit('activate', item, $event)"
          @dragstart="emit('drag-start', item, index, $event)"
          @dragend="emit('drag-end', $event)"
          @dragover.prevent="onFolderDragOver($event, item)"
          @dragleave="onFolderDragLeave($event, item)"
          @drop.prevent="onFolderDrop($event, item)"
        >
          <td class="border-b border-border/80 px-3 py-2.5">
            <label class="grid size-7 place-items-center rounded group-hover:bg-border/60">
              <span class="sr-only">Selecionar {{ item.name }}</span>
              <input
                type="checkbox"
                class="size-4 rounded border-border"
                :checked="selectedKeys.has(driveItemKey(item))"
                @click.stop
                @change="emit('toggle', item, index)"
              />
            </label>
          </td>
          <td class="border-b border-border/80 px-3 py-2.5">
            <div class="flex min-w-0 items-center gap-3">
              <component
                :is="iconFor(item)"
                class="shrink-0"
                :class="item.kind === 'folder' ? 'text-accent' : 'text-muted'"
                :size="20"
                aria-hidden="true"
              />
              <div class="min-w-0">
                <p class="truncate font-medium text-foreground" :title="item.name">{{ item.name }}</p>
                <p v-if="searching && item.folderPath" class="truncate text-xs text-muted">
                  {{ item.folderPath }}
                </p>
              </div>
            </div>
          </td>
          <td class="hidden border-b border-border/80 px-3 py-2.5 text-muted md:table-cell">
            {{ formatDate(item.updatedAt) }}
          </td>
          <td class="hidden border-b border-border/80 px-3 py-2.5 text-muted lg:table-cell">
            {{ item.typeLabel }}
          </td>
          <td class="hidden border-b border-border/80 px-3 py-2.5 text-right tabular-nums text-muted sm:table-cell">
            {{ item.kind === 'folder' ? '—' : formatBytes(item.sizeBytes) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
