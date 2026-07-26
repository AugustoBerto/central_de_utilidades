<script setup>
import {
  ChevronRight,
  Filter,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Home,
  LayoutGrid,
  List,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X
} from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import AppButton from '@/components/base/AppButton.vue';
import AppShell from '@/components/layout/AppShell.vue';
import { useConfirm } from '@/composables/useConfirm';
import DriveFileItems from '@/features/drive/DriveFileItems.vue';
import FileOrganizeDialog from '@/features/drive/FileOrganizeDialog.vue';
import FolderNameDialog from '@/features/drive/FolderNameDialog.vue';
import ImagePreviewModal from '@/features/drive/ImagePreviewModal.vue';
import {
  activeDriveFilters,
  buildDriveFilesPath,
  DRIVE_PAGE_SIZE
} from '@/features/drive/drive-query';
import { formatBytes } from '@/features/dashboard/format';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const { confirm } = useConfirm();
const currentFolder = ref(null);
const currentPath = ref([]);
const folders = ref([]);
const folderTree = ref([]);
const files = ref([]);
const queue = ref([]);
const query = ref('');
const searchCurrentFolder = ref(false);
const sort = ref('updatedAt:desc');
const page = ref(0);
const total = ref(0);
const loading = ref(true);
const folderLoading = ref(true);
const statusLoading = ref(true);
const error = ref('');
const storageStatus = ref(null);
const showFilters = ref(false);
const viewMode = ref('list');
const dragDepth = ref(0);
const previewFile = ref(null);
const previewTrigger = ref(null);
const uploadInput = ref(null);
const filters = reactive({ from: '', to: '', minSizeMb: '', maxSizeMb: '', type: 'all' });
const folderDialog = reactive({ open: false, mode: 'create', folder: null, loading: false, error: '' });
const fileDialog = reactive({ open: false, file: null, loading: false, error: '' });

let searchTimer;
let uploadSequence = 0;
let fileRequest;
let fileRequestSequence = 0;

const dragging = computed(() => dragDepth.value > 0);
const activeFilters = computed(() => activeDriveFilters(filters));
const visibleFolders = computed(() => (query.value.trim() ? [] : folders.value));
const maxUploadBytes = computed(() => storageStatus.value?.maxUploadBytes ?? 2 * 1024 ** 3);
const storagePercent = computed(() => Math.min(100, Math.max(0, storageStatus.value?.usedPercent ?? 0)));
const physicalDiskLimitsDrive = computed(() => {
  const status = storageStatus.value;
  return Boolean(status && status.physicalFreeBytes !== null && status.physicalFreeBytes < status.quotaFreeBytes);
});
const currentFolderLabel = computed(() => currentFolder.value?.name ?? 'Meu Drive');
const resultLabel = computed(() => loading.value ? 'Carregando…' : `${total.value} ${total.value === 1 ? 'arquivo' : 'arquivos'}`);

function isAbortError(caught) {
  return caught?.name === 'AbortError';
}

async function loadStatus() {
  statusLoading.value = true;
  try {
    storageStatus.value = await api('/api/drive/status');
  } catch (caught) {
    if (!isAbortError(caught)) error.value = caught.message;
  } finally {
    statusLoading.value = false;
  }
}

async function loadFolderTree() {
  try {
    folderTree.value = (await api('/api/folders/tree')).folders;
  } catch (caught) {
    error.value = caught.message;
  }
}

async function loadFolderContext() {
  folderLoading.value = true;
  try {
    const folderId = currentFolder.value?.id ?? null;
    const childrenPath = folderId === null ? '/api/folders' : `/api/folders?parentId=${folderId}`;
    const [children, detail] = await Promise.all([
      api(childrenPath),
      folderId === null ? Promise.resolve({ folder: null, path: [] }) : api(`/api/folders/${folderId}`)
    ]);
    folders.value = children.folders;
    currentFolder.value = detail.folder;
    currentPath.value = detail.path;
  } catch (caught) {
    error.value = caught.message;
  } finally {
    folderLoading.value = false;
  }
}

async function loadFiles() {
  const requestId = ++fileRequestSequence;
  fileRequest?.abort();
  fileRequest = new AbortController();
  loading.value = true;
  error.value = '';
  try {
    const result = await api(buildDriveFilesPath({
      folderId: currentFolder.value?.id ?? null,
      query: query.value,
      searchCurrentFolder: searchCurrentFolder.value,
      sort: sort.value,
      filters,
      page: page.value
    }), { signal: fileRequest.signal });
    if (requestId !== fileRequestSequence) return;
    files.value = result.files;
    total.value = result.total;
  } catch (caught) {
    if (!isAbortError(caught)) error.value = caught.message;
  } finally {
    if (requestId === fileRequestSequence) loading.value = false;
  }
}

async function refreshDirectory({ includeStatus = false, includeTree = false } = {}) {
  const tasks = [loadFolderContext(), loadFiles()];
  if (includeStatus) tasks.push(loadStatus());
  if (includeTree) tasks.push(loadFolderTree());
  await Promise.all(tasks);
}

async function openFolder(folder = null) {
  currentFolder.value = folder;
  query.value = '';
  searchCurrentFolder.value = false;
  page.value = 0;
  await refreshDirectory();
}

function scheduleFilesLoad() {
  page.value = 0;
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(loadFiles, 300);
}

function clearFilter(key) {
  filters[key] = key === 'type' ? 'all' : '';
}

function clearFilters() {
  filters.from = '';
  filters.to = '';
  filters.minSizeMb = '';
  filters.maxSizeMb = '';
  filters.type = 'all';
}

function openCreateFolder() {
  folderDialog.mode = 'create';
  folderDialog.folder = null;
  folderDialog.error = '';
  folderDialog.open = true;
}

function openRenameFolder(folder) {
  folderDialog.mode = 'rename';
  folderDialog.folder = folder;
  folderDialog.error = '';
  folderDialog.open = true;
}

function closeFolderDialog() {
  if (!folderDialog.loading) folderDialog.open = false;
}

async function saveFolder(name) {
  folderDialog.loading = true;
  folderDialog.error = '';
  try {
    if (folderDialog.mode === 'create') {
      await api('/api/folders', {
        method: 'POST',
        headers: { 'X-CSRF-Token': auth.csrfToken },
        body: { name, parentId: currentFolder.value?.id ?? null }
      });
    } else {
      await api(`/api/folders/${folderDialog.folder.id}`, {
        method: 'PATCH',
        headers: { 'X-CSRF-Token': auth.csrfToken },
        body: { name }
      });
    }
    folderDialog.open = false;
    await Promise.all([loadFolderContext(), loadFolderTree()]);
  } catch (caught) {
    folderDialog.error = caught.fields?.name ?? caught.message;
  } finally {
    folderDialog.loading = false;
  }
}

async function removeFolder(folder) {
  const accepted = await confirm({
    title: 'Excluir pasta?',
    message: `A pasta “${folder.name}” será excluída. Pastas com conteúdo não podem ser removidas.`,
    confirmLabel: 'Excluir pasta',
    cancelLabel: 'Cancelar',
    variant: 'danger'
  });
  if (!accepted) return;
  error.value = '';
  try {
    await api(`/api/folders/${folder.id}`, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': auth.csrfToken }
    });
    await Promise.all([loadFolderContext(), loadFolderTree()]);
  } catch (caught) {
    error.value = caught.message;
  }
}

function openOrganizeFile(file) {
  fileDialog.file = file;
  fileDialog.error = '';
  fileDialog.open = true;
}

function closeFileDialog() {
  if (!fileDialog.loading) fileDialog.open = false;
}

async function saveFile(changes) {
  fileDialog.loading = true;
  fileDialog.error = '';
  try {
    await api(`/api/files/${fileDialog.file.id}`, {
      method: 'PATCH',
      headers: { 'X-CSRF-Token': auth.csrfToken },
      body: changes
    });
    fileDialog.open = false;
    await Promise.all([loadFiles(), loadFolderContext()]);
  } catch (caught) {
    fileDialog.error = caught.fields?.originalName ?? caught.fields?.folderId ?? caught.message;
  } finally {
    fileDialog.loading = false;
  }
}

function upload(file, destination = currentFolder.value) {
  const targetFolderId = destination?.id ?? null;
  const targetFolderName = destination?.name ?? 'Meu Drive';
  const item = {
    id: ++uploadSequence,
    file,
    targetFolderId,
    targetFolderName,
    progress: 0,
    status: 'enviando',
    error: '',
    xhr: null,
    dismissTimer: null
  };
  queue.value.push(item);
  if (file.size > maxUploadBytes.value) {
    item.status = 'erro';
    item.error = `O arquivo excede o limite de ${formatBytes(maxUploadBytes.value)}.`;
    return;
  }
  const xhr = new XMLHttpRequest();
  item.xhr = xhr;
  xhr.open('POST', '/api/files');
  xhr.withCredentials = true;
  xhr.setRequestHeader('X-CSRF-Token', auth.csrfToken);
  xhr.setRequestHeader('X-File-Name', file.name);
  xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
  if (targetFolderId !== null) xhr.setRequestHeader('X-Folder-Id', String(targetFolderId));
  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) item.progress = Math.round((event.loaded / event.total) * 100);
  };
  xhr.onload = async () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      item.status = 'concluído';
      item.progress = 100;
      const tasks = [loadStatus()];
      if ((currentFolder.value?.id ?? null) === targetFolderId) tasks.push(loadFiles());
      await Promise.all(tasks);
      item.dismissTimer = window.setTimeout(() => {
        queue.value = queue.value.filter((candidate) => candidate.id !== item.id);
      }, 3500);
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
  const destination = currentFolder.value ? { ...currentFolder.value } : null;
  for (const file of Array.from(list ?? [])) upload(file, destination);
}

function selectFiles(event) {
  addFiles(event.target.files);
  event.target.value = '';
}

function hasFiles(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

function onDragEnter(event) {
  if (hasFiles(event)) dragDepth.value += 1;
}

function onDragLeave(event) {
  if (hasFiles(event)) dragDepth.value = Math.max(0, dragDepth.value - 1);
}

function onDrop(event) {
  dragDepth.value = 0;
  if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
}

function cancel(item) {
  item.xhr?.abort();
}

function retry(item) {
  window.clearTimeout(item.dismissTimer);
  queue.value = queue.value.filter((candidate) => candidate.id !== item.id);
  upload(item.file, item.targetFolderId === null ? null : { id: item.targetFolderId, name: item.targetFolderName });
}

async function remove(file) {
  const accepted = await confirm({
    title: 'Excluir arquivo?',
    message: `“${file.originalName}” será excluído permanentemente.`,
    confirmLabel: 'Excluir',
    cancelLabel: 'Cancelar',
    variant: 'danger'
  });
  if (!accepted) return;
  error.value = '';
  try {
    await api(`/api/files/${file.id}`, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': auth.csrfToken }
    });
    await Promise.all([loadFiles(), loadStatus()]);
  } catch (caught) {
    error.value = caught.message;
  }
}

function preview(file, event) {
  previewTrigger.value = event?.currentTarget ?? null;
  previewFile.value = file;
}

function closePreview() {
  previewFile.value = null;
  requestAnimationFrame(() => previewTrigger.value?.focus?.());
}

watch([
  query,
  searchCurrentFolder,
  sort,
  () => filters.from,
  () => filters.to,
  () => filters.minSizeMb,
  () => filters.maxSizeMb,
  () => filters.type
], scheduleFilesLoad);
watch(page, loadFiles);

onMounted(async () => {
  await Promise.all([loadStatus(), loadFolderTree(), loadFolderContext(), loadFiles()]);
});

onBeforeUnmount(() => {
  fileRequest?.abort();
  window.clearTimeout(searchTimer);
  queue.value.forEach((item) => window.clearTimeout(item.dismissTimer));
  queue.value.filter((item) => item.status === 'enviando').forEach(cancel);
});
</script>

<template>
  <AppShell>
    <section class="relative min-h-[calc(100vh-8rem)] space-y-5" @dragenter.prevent="onDragEnter" @dragover.prevent @dragleave.prevent="onDragLeave" @drop.prevent="onDrop">
      <div v-if="dragging" class="pointer-events-none absolute inset-0 z-30 flex min-h-[28rem] items-center justify-center rounded-xl border-2 border-dashed border-accent bg-canvas/95 p-6 backdrop-blur-sm" role="status" aria-live="polite">
        <div class="text-center">
          <span class="mx-auto flex size-14 items-center justify-center rounded-full bg-accent/15 text-accent"><Upload :size="28" aria-hidden="true" /></span>
          <h2 class="mt-4 text-lg font-semibold">Solte para enviar</h2>
          <p class="mt-1 text-sm text-muted">Os arquivos serão adicionados à pasta “{{ currentFolderLabel }}”.</p>
        </div>
      </div>

      <header class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div class="min-w-0">
          <nav aria-label="Caminho da pasta" class="flex flex-wrap items-center gap-1 text-sm">
            <button type="button" class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted hover:bg-elevated hover:text-foreground" :class="{ 'font-medium text-foreground': !currentFolder }" @click="openFolder(null)">
              <Home :size="15" aria-hidden="true" />Meu Drive
            </button>
            <template v-for="folder in currentPath" :key="folder.id">
              <ChevronRight class="text-muted" :size="15" aria-hidden="true" />
              <button type="button" class="max-w-48 truncate rounded-md px-2 py-1 text-muted hover:bg-elevated hover:text-foreground" :class="{ 'font-medium text-foreground': folder.id === currentFolder?.id }" @click="openFolder(folder)">{{ folder.name }}</button>
            </template>
          </nav>
          <h2 class="mt-3 text-xl font-semibold">{{ currentFolderLabel }}</h2>
          <p class="mt-1 text-sm text-muted">Organize arquivos em pastas, pesquise em todo o Drive e acompanhe o armazenamento.</p>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <AppButton variant="secondary" @click="openCreateFolder"><FolderPlus :size="17" aria-hidden="true" />Nova pasta</AppButton>
          <AppButton @click="uploadInput?.click()"><Upload :size="17" aria-hidden="true" />Importar arquivos</AppButton>
          <input ref="uploadInput" class="sr-only" type="file" multiple @change="selectFiles" />
        </div>
      </header>

      <section class="rounded-xl border border-border bg-surface p-5" aria-labelledby="storage-title">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-center">
          <span class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent"><HardDrive :size="22" aria-hidden="true" /></span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 id="storage-title" class="font-semibold">Armazenamento do Drive</h2>
                <p v-if="storageStatus" class="mt-1 text-sm text-muted">{{ formatBytes(storageStatus.usedBytes) }} de {{ formatBytes(storageStatus.reservedBytes) }} utilizados</p>
                <p v-else class="mt-1 text-sm text-muted">{{ statusLoading ? 'Calculando armazenamento…' : 'Informações indisponíveis.' }}</p>
              </div>
              <span v-if="storageStatus" class="text-sm font-medium">{{ formatBytes(storageStatus.effectiveFreeBytes) }} disponíveis</span>
            </div>
            <div class="mt-3 h-2 overflow-hidden rounded-full bg-elevated" role="progressbar" aria-label="Uso do armazenamento do Drive" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(storagePercent)">
              <div class="h-full rounded-full bg-accent transition-[width]" :style="{ width: `${storagePercent}%` }" />
            </div>
            <div v-if="storageStatus" class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <span>Máximo por arquivo: {{ formatBytes(storageStatus.maxUploadBytes) }}</span>
              <span v-if="physicalDiskLimitsDrive">O espaço físico da máquina limita a disponibilidade atual.</span>
            </div>
          </div>
        </div>
      </section>

      <section v-if="queue.length" class="rounded-xl border border-border bg-surface p-4">
        <div class="flex items-center justify-between gap-3"><h2 class="font-semibold">Uploads</h2><span class="text-xs text-muted">{{ queue.length }} na fila</span></div>
        <ul class="mt-3 divide-y divide-border">
          <li v-for="item in queue" :key="item.id" class="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap justify-between gap-2 text-sm"><p class="truncate font-medium">{{ item.file.name }}</p><span class="text-xs text-muted">Destino: {{ item.targetFolderName }}</span></div>
              <div class="mt-2 h-1.5 overflow-hidden rounded bg-elevated" role="progressbar" :aria-label="`Upload de ${item.file.name}`" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="item.progress">
                <div class="h-full bg-accent transition-[width]" :style="{ width: `${item.progress}%` }" />
              </div>
              <p class="mt-1 text-xs text-muted" aria-live="polite">{{ item.status }}<span v-if="item.status === 'enviando'"> · {{ item.progress }}%</span><span v-if="item.error"> · {{ item.error }}</span></p>
            </div>
            <AppButton v-if="item.status === 'enviando'" variant="secondary" @click="cancel(item)"><X :size="16" aria-hidden="true" />Cancelar</AppButton>
            <AppButton v-else-if="item.status === 'erro' || item.status === 'cancelado'" variant="secondary" @click="retry(item)"><RotateCcw :size="16" aria-hidden="true" />Repetir</AppButton>
          </li>
        </ul>
      </section>

      <section class="rounded-xl border border-border bg-surface" :aria-busy="folderLoading || loading">
        <div class="border-b border-border p-4">
          <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label class="relative min-w-0 flex-1">
              <span class="sr-only">Buscar arquivos em todo o Drive</span>
              <Search class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" :size="17" aria-hidden="true" />
              <input v-model="query" class="min-h-11 w-full rounded-md border border-border bg-canvas py-2 pl-10 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" placeholder="Buscar arquivos por nome em todo o Drive" type="search" />
            </label>
            <div class="flex flex-wrap gap-2">
              <AppButton variant="secondary" :aria-expanded="showFilters" aria-controls="drive-filters" @click="showFilters = !showFilters">
                <Filter :size="16" aria-hidden="true" />Filtros
                <span v-if="activeFilters.length" class="rounded-full bg-accent px-1.5 py-0.5 text-[10px] leading-none text-white">{{ activeFilters.length }}</span>
              </AppButton>
              <label><span class="sr-only">Ordenar arquivos</span><select v-model="sort" class="min-h-10 rounded-md border border-border bg-elevated px-3 text-sm">
                <option value="updatedAt:desc">Mais recentes</option><option value="updatedAt:asc">Mais antigos</option><option value="createdAt:desc">Criação recente</option><option value="name:asc">Nome, A–Z</option><option value="name:desc">Nome, Z–A</option><option value="size:desc">Maior tamanho</option><option value="size:asc">Menor tamanho</option>
              </select></label>
              <div class="flex rounded-md border border-border bg-elevated p-1" role="group" aria-label="Modo de exibição">
                <button type="button" class="rounded p-1.5 text-muted hover:text-foreground" :class="{ 'bg-border text-foreground': viewMode === 'list' }" aria-label="Exibir como lista" :aria-pressed="viewMode === 'list'" @click="viewMode = 'list'"><List :size="17" aria-hidden="true" /></button>
                <button type="button" class="rounded p-1.5 text-muted hover:text-foreground" :class="{ 'bg-border text-foreground': viewMode === 'grid' }" aria-label="Exibir como grade" :aria-pressed="viewMode === 'grid'" @click="viewMode = 'grid'"><LayoutGrid :size="17" aria-hidden="true" /></button>
              </div>
            </div>
          </div>
          <label v-if="query.trim()" class="mt-3 inline-flex items-center gap-2 text-sm text-muted"><input v-model="searchCurrentFolder" type="checkbox" class="size-4 rounded border-border" />Buscar somente em “{{ currentFolderLabel }}”</label>
          <div v-if="showFilters" id="drive-filters" class="mt-4 grid gap-3 rounded-lg border border-border bg-canvas p-4 sm:grid-cols-2 xl:grid-cols-5">
            <label class="text-xs font-medium text-muted">Modificado a partir de<input v-model="filters.from" type="date" class="mt-1 min-h-10 w-full rounded-md border border-border bg-surface px-2 text-sm text-foreground" /></label>
            <label class="text-xs font-medium text-muted">Modificado até<input v-model="filters.to" type="date" class="mt-1 min-h-10 w-full rounded-md border border-border bg-surface px-2 text-sm text-foreground" /></label>
            <label class="text-xs font-medium text-muted">Tamanho mínimo (MB)<input v-model="filters.minSizeMb" type="number" min="0" step="0.1" class="mt-1 min-h-10 w-full rounded-md border border-border bg-surface px-2 text-sm text-foreground" /></label>
            <label class="text-xs font-medium text-muted">Tamanho máximo (MB)<input v-model="filters.maxSizeMb" type="number" min="0" step="0.1" class="mt-1 min-h-10 w-full rounded-md border border-border bg-surface px-2 text-sm text-foreground" /></label>
            <label class="text-xs font-medium text-muted">Tipo<select v-model="filters.type" class="mt-1 min-h-10 w-full rounded-md border border-border bg-surface px-2 text-sm text-foreground"><option value="all">Todos</option><option value="document">Documentos</option><option value="image">Imagens</option><option value="audio">Áudios</option><option value="video">Vídeos</option><option value="other">Outros</option></select></label>
          </div>
          <div v-if="activeFilters.length" class="mt-3 flex flex-wrap items-center gap-2">
            <button v-for="item in activeFilters" :key="item.key" type="button" class="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-2.5 py-1 text-xs text-muted hover:text-foreground" :aria-label="`Remover filtro ${item.label}`" @click="clearFilter(item.key)">{{ item.label }}<X :size="13" aria-hidden="true" /></button>
            <button type="button" class="text-xs text-accent hover:underline" @click="clearFilters">Limpar filtros</button>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 text-sm text-muted" aria-live="polite"><span>{{ resultLabel }}</span><span v-if="query.trim() && !searchCurrentFolder">Resultados em todo o Drive</span><span v-else>Conteúdo de {{ currentFolderLabel }}</span></div>
        <p v-if="error" class="m-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500" role="alert">{{ error }}</p>
        <div v-if="folderLoading || loading" class="p-5 text-sm text-muted">Carregando conteúdo…</div>

        <template v-else>
          <section v-if="visibleFolders.length" class="border-b border-border p-4" aria-labelledby="folders-title">
            <h3 id="folders-title" class="mb-3 text-sm font-semibold">Pastas</h3>
            <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <li v-for="folder in visibleFolders" :key="folder.id" class="group rounded-lg border border-border bg-canvas p-3 transition hover:border-accent/60">
                <div class="flex items-start gap-3">
                  <button type="button" class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="openFolder(folder)"><span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Folder :size="21" aria-hidden="true" /></span><span class="min-w-0"><span class="block truncate font-medium">{{ folder.name }}</span><span class="mt-0.5 block text-xs text-muted">Abrir pasta</span></span></button>
                  <div class="flex shrink-0 gap-1 opacity-80 transition group-hover:opacity-100">
                    <button type="button" class="rounded-md p-2 text-muted hover:bg-elevated hover:text-foreground" :aria-label="`Renomear ${folder.name}`" @click="openRenameFolder(folder)"><Pencil :size="15" aria-hidden="true" /></button>
                    <button type="button" class="rounded-md p-2 text-muted hover:bg-red-500/10 hover:text-red-500" :aria-label="`Excluir ${folder.name}`" @click="removeFolder(folder)"><Trash2 :size="15" aria-hidden="true" /></button>
                  </div>
                </div>
              </li>
            </ul>
          </section>

          <div v-if="files.length === 0 && visibleFolders.length === 0" class="p-10 text-center text-sm text-muted">
            <FolderOpen class="mx-auto" :size="30" aria-hidden="true" />
            <p class="mt-3 font-medium text-foreground">{{ query.trim() || activeFilters.length ? 'Nenhum arquivo encontrado' : 'Esta pasta está vazia' }}</p>
            <p class="mt-1">{{ query.trim() || activeFilters.length ? 'Ajuste a busca ou remova alguns filtros.' : 'Crie uma pasta, importe arquivos ou arraste-os para esta área.' }}</p>
            <div v-if="!query.trim() && !activeFilters.length" class="mt-4 flex flex-wrap justify-center gap-2"><AppButton variant="secondary" @click="openCreateFolder"><FolderPlus :size="16" aria-hidden="true" />Nova pasta</AppButton><AppButton @click="uploadInput?.click()"><Upload :size="16" aria-hidden="true" />Importar</AppButton></div>
          </div>

          <DriveFileItems v-else-if="files.length" :files="files" :view-mode="viewMode" :searching="Boolean(query.trim())" @preview="preview" @organize="openOrganizeFile" @remove="remove" />
        </template>

        <div v-if="total > DRIVE_PAGE_SIZE" class="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted"><span>Página {{ page + 1 }} de {{ Math.ceil(total / DRIVE_PAGE_SIZE) }}</span><div class="flex gap-2"><AppButton variant="secondary" :disabled="page === 0" @click="page -= 1">Anterior</AppButton><AppButton variant="secondary" :disabled="(page + 1) * DRIVE_PAGE_SIZE >= total" @click="page += 1">Próxima</AppButton></div></div>
      </section>
    </section>

    <FolderNameDialog v-if="folderDialog.open" :title="folderDialog.mode === 'create' ? 'Nova pasta' : 'Renomear pasta'" :description="folderDialog.mode === 'create' ? `A pasta será criada em “${currentFolderLabel}”.` : 'Escolha um novo nome para esta pasta.'" :initial-name="folderDialog.folder?.name ?? ''" :submit-label="folderDialog.mode === 'create' ? 'Criar pasta' : 'Salvar nome'" :loading="folderDialog.loading" :error="folderDialog.error" @close="closeFolderDialog" @submit="saveFolder" />
    <FileOrganizeDialog v-if="fileDialog.open" :file="fileDialog.file" :folders="folderTree" :loading="fileDialog.loading" :error="fileDialog.error" @close="closeFileDialog" @submit="saveFile" />
    <ImagePreviewModal v-if="previewFile" :file="previewFile" @close="closePreview" />
  </AppShell>
</template>
