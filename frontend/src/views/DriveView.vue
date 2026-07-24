<script setup>
import {
  Download,
  FileText,
  FolderOpen,
  Image,
  Search,
  Trash2,
  Upload,
  X
} from 'lucide-vue-next';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

import AppButton from '@/components/base/AppButton.vue';
import AppShell from '@/components/layout/AppShell.vue';
import { formatBytes } from '@/features/dashboard/format';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';

const MAX_UPLOAD_BYTES = 2_147_483_648;
const auth = useAuthStore();
const files = ref([]);
const queue = ref([]);
const query = ref('');
const sort = ref('updatedAt:desc');
const page = ref(0);
const total = ref(0);
const loading = ref(true);
const error = ref('');
const dragging = ref(false);
let searchTimer;
let uploadSequence = 0;

function iconFor(file) {
  return file.mimeType.startsWith('image/') ? Image : FileText;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [sortBy, order] = sort.value.split(':');
    const result = await api(
      `/api/files?q=${encodeURIComponent(query.value)}&sort=${sortBy}&order=${order}&limit=50&offset=${page.value * 50}`
    );
    files.value = result.files;
    total.value = result.total;
  } catch (caught) {
    error.value = caught.message;
  } finally {
    loading.value = false;
  }
}

function upload(file) {
  const item = {
    id: ++uploadSequence,
    file,
    progress: 0,
    status: 'enviando',
    error: '',
    xhr: null,
    dismissTimer: null
  };
  queue.value.push(item);
  if (file.size > MAX_UPLOAD_BYTES) {
    item.status = 'erro';
    item.error = 'O arquivo excede o limite de 2 GiB.';
    return;
  }
  const xhr = new XMLHttpRequest();
  item.xhr = xhr;
  xhr.open('POST', '/api/files');
  xhr.withCredentials = true;
  xhr.setRequestHeader('X-CSRF-Token', auth.csrfToken);
  xhr.setRequestHeader('X-File-Name', file.name);
  xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable)
      item.progress = Math.round((event.loaded / event.total) * 100);
  };
  xhr.onload = async () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      item.status = 'concluído';
      item.progress = 100;
      await load();
      item.dismissTimer = window.setTimeout(() => {
        queue.value = queue.value.filter((candidate) => candidate.id !== item.id);
      }, 3000);
      return;
    }
    item.status = 'erro';
    try {
      item.error = JSON.parse(xhr.responseText).error.message;
    } catch {
      item.error = 'Não foi possível enviar o arquivo.';
    }
  };
  xhr.onerror = () => {
    item.status = 'erro';
    item.error = 'Falha de rede durante o upload.';
  };
  xhr.onabort = () => {
    item.status = 'cancelado';
    item.error = 'Upload cancelado.';
  };
  xhr.send(file);
}

function addFiles(list) {
  for (const file of Array.from(list)) upload(file);
}

function onDrop(event) {
  dragging.value = false;
  addFiles(event.dataTransfer.files);
}

function cancel(item) {
  item.xhr?.abort();
}

function retry(item) {
  window.clearTimeout(item.dismissTimer);
  queue.value = queue.value.filter((candidate) => candidate.id !== item.id);
  upload(item.file);
}

async function remove(file) {
  if (
    !window.confirm(`Excluir “${file.originalName}”? Esta ação não pode ser desfeita.`)
  )
    return;
  error.value = '';
  try {
    await api(`/api/files/${file.id}`, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': auth.csrfToken }
    });
    await load();
  } catch (caught) {
    error.value = caught.message;
  }
}

function preview(file) {
  window.open(`/api/files/${file.id}/preview`, '_blank', 'noopener');
}

watch([query, sort], () => {
  page.value = 0;
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(load, 250);
});
watch(page, load);
onMounted(load);
onBeforeUnmount(() => {
  window.clearTimeout(searchTimer);
  queue.value.forEach((item) => window.clearTimeout(item.dismissTimer));
  queue.value.filter((item) => item.status === 'enviando').forEach(cancel);
});
</script>

<template>
  <AppShell>
    <section class="space-y-6">
      <div
        class="rounded-lg border border-dashed p-6 text-center transition-colors"
        :class="dragging ? 'border-accent bg-accent/10' : 'border-border bg-surface'"
        @dragenter.prevent="dragging = true"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <Upload class="mx-auto text-accent" :size="28" aria-hidden="true" />
        <h2 class="mt-3 font-semibold">Envie arquivos para o Drive</h2>
        <p class="mt-1 text-sm text-muted">
          Arraste arquivos aqui ou selecione do dispositivo. Limite: 2 GiB por arquivo.
        </p>
        <label
          class="mt-4 inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-accent bg-accent px-3 text-sm font-medium text-white hover:bg-blue-500"
          ><input
            class="sr-only"
            type="file"
            multiple
            @change="addFiles($event.target.files)"
          />Selecionar arquivos</label
        >
      </div>

      <section
        v-if="queue.length"
        class="rounded-lg border border-border bg-surface p-4"
      >
        <h2 class="font-semibold">Uploads</h2>
        <ul class="mt-3 divide-y divide-border">
          <li
            v-for="item in queue"
            :key="item.id"
            class="flex items-center gap-3 py-3"
          >
            <FileText class="shrink-0 text-muted" :size="18" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm">{{ item.file.name }}</p>
              <div class="mt-1 h-1.5 overflow-hidden rounded bg-elevated">
                <div
                  class="h-full bg-accent transition-[width]"
                  :style="{ width: `${item.progress}%` }"
                />
              </div>
              <p class="mt-1 text-xs text-muted">
                {{ item.status
                }}<span v-if="item.status === 'enviando'"> · {{ item.progress }}%</span
                ><span v-if="item.error"> · {{ item.error }}</span>
              </p>
            </div>
            <AppButton
              v-if="item.status === 'enviando'"
              variant="secondary"
              @click="cancel(item)"
              ><X :size="16" aria-hidden="true" />Cancelar</AppButton
            ><AppButton
              v-else-if="item.status === 'erro' || item.status === 'cancelado'"
              variant="secondary"
              @click="retry(item)"
              >Repetir</AppButton
            >
          </li>
        </ul>
      </section>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="font-semibold">Arquivos</h2>
        <div class="flex flex-wrap gap-2">
          <label class="relative block"
            ><span class="sr-only">Buscar arquivos</span
            ><Search
              class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              :size="16" /><input
              v-model="query"
              class="rounded-md border border-border bg-surface py-2 pl-9 pr-3 text-sm"
              placeholder="Buscar arquivos"
          /></label>
          <label
            ><span class="sr-only">Ordenar arquivos</span
            ><select
              v-model="sort"
              class="min-h-10 rounded-md border border-border bg-surface px-3 text-sm"
            >
              <option value="updatedAt:desc">Mais recentes</option>
              <option value="updatedAt:asc">Mais antigos</option>
              <option value="name:asc">Nome, A–Z</option>
              <option value="size:desc">Maior tamanho</option>
            </select></label
          >
        </div>
      </div>
      <p
        v-if="error"
        class="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200"
        role="alert"
      >
        {{ error }}
      </p>
      <div
        v-if="loading"
        class="rounded-lg border border-border bg-surface p-5 text-sm text-muted"
      >
        Carregando arquivos…
      </div>
      <div
        v-else-if="files.length === 0"
        class="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted"
      >
        <FolderOpen class="mx-auto" :size="26" aria-hidden="true" />{{
          query ? 'Nenhum arquivo encontrado.' : 'O Drive ainda está vazio.'
        }}
      </div>
      <ul
        v-else
        class="divide-y divide-border rounded-lg border border-border bg-surface"
      >
        <li
          v-for="file in files"
          :key="file.id"
          class="flex flex-wrap items-center gap-3 p-4"
        >
          <component
            :is="iconFor(file)"
            class="text-muted"
            :size="20"
            aria-hidden="true"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">{{ file.originalName }}</p>
            <p class="mt-1 text-xs text-muted">
              {{ formatBytes(file.sizeBytes) }} ·
              {{ new Date(file.updatedAt).toLocaleString('pt-BR') }}
            </p>
          </div>
          <div class="flex gap-2">
            <AppButton
              v-if="file.previewAvailable"
              variant="secondary"
              @click="preview(file)"
              >Preview</AppButton
            ><a
              :href="`/api/files/${file.id}/download`"
              class="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-elevated px-3 text-sm font-medium hover:bg-border"
              ><Download :size="16" aria-hidden="true" />Baixar</a
            ><AppButton variant="danger" @click="remove(file)"
              ><Trash2 :size="16" aria-hidden="true" />Excluir</AppButton
            >
          </div>
        </li>
      </ul>
      <div
        v-if="total > 50"
        class="flex items-center justify-between text-sm text-muted"
      >
        <span>{{ total }} arquivos</span>
        <div class="flex gap-2">
          <AppButton variant="secondary" :disabled="page === 0" @click="page -= 1"
            >Anterior</AppButton
          >
          <AppButton
            variant="secondary"
            :disabled="(page + 1) * 50 >= total"
            @click="page += 1"
            >Próxima</AppButton
          >
        </div>
      </div>
    </section>
  </AppShell>
</template>
