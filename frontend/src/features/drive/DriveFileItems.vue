<script setup>
import {
  Download,
  Eye,
  FileAudio,
  FilePenLine,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Trash2
} from 'lucide-vue-next';

import AppButton from '@/components/base/AppButton.vue';
import { formatBytes } from '@/features/dashboard/format';

defineProps({
  files: { type: Array, required: true },
  viewMode: { type: String, default: 'list' },
  searching: { type: Boolean, default: false }
});

const emit = defineEmits(['preview', 'organize', 'remove']);

function iconFor(file) {
  if (file.mimeType.startsWith('image/')) return ImageIcon;
  if (file.mimeType.startsWith('audio/')) return FileAudio;
  if (file.mimeType.startsWith('video/')) return FileVideo;
  return FileText;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}
</script>

<template>
  <ul v-if="viewMode === 'list'" class="divide-y divide-border">
    <li v-for="file in files" :key="file.id" class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <component :is="iconFor(file)" class="shrink-0 text-muted" :size="21" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium" :title="file.originalName">{{ file.originalName }}</p>
        <p class="mt-1 text-xs text-muted">
          <span v-if="file.folderPath && searching">{{ file.folderPath }} · </span>
          {{ formatBytes(file.sizeBytes) }} · {{ formatDate(file.updatedAt) }}
        </p>
      </div>
      <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <AppButton v-if="file.previewAvailable" variant="secondary" @click="emit('preview', file, $event)">
          <Eye :size="16" aria-hidden="true" />Preview
        </AppButton>
        <AppButton variant="secondary" @click="emit('organize', file, $event)">
          <FilePenLine :size="16" aria-hidden="true" />Organizar
        </AppButton>
        <a :href="`/api/files/${file.id}/download`" class="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-elevated px-3 text-sm font-medium hover:bg-border">
          <Download :size="16" aria-hidden="true" />Baixar
        </a>
        <AppButton variant="danger" @click="emit('remove', file)">
          <Trash2 :size="16" aria-hidden="true" />Excluir
        </AppButton>
      </div>
    </li>
  </ul>

  <ul v-else class="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
    <li v-for="file in files" :key="file.id" class="flex min-h-48 flex-col rounded-lg border border-border bg-canvas p-4">
      <component :is="iconFor(file)" class="text-accent" :size="26" aria-hidden="true" />
      <div class="mt-4 min-w-0 flex-1">
        <p class="truncate font-medium" :title="file.originalName">{{ file.originalName }}</p>
        <p v-if="file.folderPath && searching" class="mt-1 truncate text-xs text-muted">{{ file.folderPath }}</p>
        <p class="mt-1 text-xs text-muted">{{ formatBytes(file.sizeBytes) }} · {{ formatDate(file.updatedAt) }}</p>
      </div>
      <div class="mt-4 flex flex-wrap gap-1">
        <button v-if="file.previewAvailable" type="button" class="rounded-md p-2 text-muted hover:bg-elevated hover:text-foreground" :aria-label="`Visualizar ${file.originalName}`" @click="emit('preview', file, $event)">
          <Eye :size="17" aria-hidden="true" />
        </button>
        <button type="button" class="rounded-md p-2 text-muted hover:bg-elevated hover:text-foreground" :aria-label="`Organizar ${file.originalName}`" @click="emit('organize', file, $event)">
          <FilePenLine :size="17" aria-hidden="true" />
        </button>
        <a :href="`/api/files/${file.id}/download`" class="rounded-md p-2 text-muted hover:bg-elevated hover:text-foreground" :aria-label="`Baixar ${file.originalName}`">
          <Download :size="17" aria-hidden="true" />
        </a>
        <button type="button" class="rounded-md p-2 text-muted hover:bg-red-500/10 hover:text-red-500" :aria-label="`Excluir ${file.originalName}`" @click="emit('remove', file)">
          <Trash2 :size="17" aria-hidden="true" />
        </button>
      </div>
    </li>
  </ul>
</template>
