<script setup>
import {
  ChevronRight,
  Download,
  Eye,
  Filter,
  FolderPlus,
  FolderTree,
  Home,
  Move,
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
import DriveFilterPopover from '@/features/drive/DriveFilterPopover.vue';
import DriveFolderTree from '@/features/drive/DriveFolderTree.vue';
import DriveMoveDialog from '@/features/drive/DriveMoveDialog.vue';
import DriveStorageBar from '@/features/drive/DriveStorageBar.vue';
import DriveTable from '@/features/drive/DriveTable.vue';
import FolderNameDialog from '@/features/drive/FolderNameDialog.vue';
import ImagePreviewModal from '@/features/drive/ImagePreviewModal.vue';
import {
  activeDriveFilters,
  buildDriveItemsPath,
  DRIVE_PAGE_SIZE
} from '@/features/drive/drive-query';
import { formatBytes } from '@/features/dashboard/format';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import { useDriveSelection } from '@/features/drive/useDriveSelection';

const INTERNAL_DRAG_TYPE = 'application/x-painel-drive-items';
const auth = useAuthStore();
const { confirm } = useConfirm();
const currentFolder = ref(null);
const currentPath = ref([]);
const folderTreeItems = ref([]);
const items = ref([]);
const queue = ref([]);
const query = ref('');
const searchCurrentFolder = ref(false);
const sort = ref('name:asc');
const page = ref(0);
const total = ref(0);
const loading = ref(true);
const statusLoading = ref(true);
const error = ref('');
const notice = ref('');
const busy = ref(false);
const storageStatus = ref(null);
const showFilters = ref(false);
const showFolderTree = ref(false);
const externalDragDepth = ref(0);
const previewFile = ref(null);
const previewTrigger = ref(null);
const uploadInput = ref(null);
const filters = reactive({ from: '', to: '', minSizeMb: '', maxSizeMb: '', type: 'all' });
const nameDialog = reactive({
  open: false,
  mode: 'create-folder',
  item: null,
  loading: false,
  error: ''
});
const moveDialog = reactive({ open: false, loading: false, error: '' });
const internalDrag = reactive({
  active: false,
  items: [],
  dropTargetId: null,
  treeWasOpen: false
});

const {
  selectedKeys,
  selectedItems,
  allPageSelected,
  somePageSelected,
  clear: clearSelection,
  isSelected,
  select,
  selectOnly,
  toggle,
  togglePage
} = useDriveSelection(items);

let searchTimer;
let uploadSequence = 0;
let itemRequest;
let itemRequestSequence = 0;
let noticeTimer;

const activeFilters = computed(() => activeDriveFilters(filters));
const currentFolderLabel = computed(() => currentFolder.value?.name ?? 'Meu Drive');
const selectedSingle = computed(() =>
  selectedItems.value.length === 1 ? selectedItems.value[0] : null
);
const maxUploadBytes = computed(
  () => storageStatus.value?.maxUploadBytes ?? 2 * 1024 ** 3
);
const externalDragging = computed(() => externalDragDepth.value > 0);
const dialogsOpen = computed(
  () => nameDialog.open || moveDialog.open || Boolean(previewFile.value)
);

function isAbortError(caught) {
  return caught?.name === 'AbortError';
}

function announce(message) {
  notice.value = message;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    notice.value = '';
  }, 4500);
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
    folderTreeItems.value = (await api('/api/folders/tree')).folders;
  } catch (caught) {
    error.value = caught.message;
  }
}

async function loadFolderContext() {
  try {
    const folderId = currentFolder.value?.id ?? null;
    const detail = folderId === null
      ? { folder: null, path: [] }
      : await api(`/api/folders/${folderId}`);
    currentFolder.value = detail.folder;
    currentPath.value = detail.path;
  } catch (caught) {
    error.value = caught.message;
  }
}

async function loadItems() {
  const requestId = ++itemRequestSequence;
  itemRequest?.abort();
  itemRequest = new AbortController();
  loading.value = true;
  error.value = '';
  try {
    const result = await api(
      buildDriveItemsPath({
        folderId: currentFolder.value?.id ?? null,
        query: query.value,
        searchCurrentFolder: searchCurrentFolder.value,
        sort: sort.value,
        filters,
        page: page.value
      }),
      { signal: itemRequest.signal }
    );
    if (requestId !== itemRequestSequence) return;
    items.value = result.items;
    total.value = result.total;
  } catch (caught) {
    if (!isAbortError(caught)) error.value = caught.message;
  } finally {
    if (requestId === itemRequestSequence) loading.value = false;
  }
}

async function refreshWorkspace({ status = false, tree = false, context = false } = {}) {
  const tasks = [loadItems()];
  if (status) tasks.push(loadStatus());
  if (tree) tasks.push(loadFolderTree());
  if (context) tasks.push(loadFolderContext());
  await Promise.all(tasks);
}

async function openFolder(folder = null) {
  window.clearTimeout(searchTimer);
  currentFolder.value = folder;
  query.value = '';
  searchCurrentFolder.value = false;
  page.value = 0;
  clearSelection();
  showFolderTree.value = false;
  await Promise.all([loadFolderContext(), loadItems()]);
}

function scheduleItemsLoad() {
  clearSelection();
  page.value = 0;
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(loadItems, 250);
}

function changeSort(field) {
  const [active, order] = sort.value.split(':');
  const defaultOrder = ['updatedAt', 'createdAt'].includes(field) ? 'desc' : 'asc';
  sort.value = active === field
    ? `${field}:${order === 'asc' ? 'desc' : 'asc'}`
    : `${field}:${defaultOrder}`;
}

function changeFilter(key, value) {
  filters[key] = value;
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
  nameDialog.mode = 'create-folder';
  nameDialog.item = null;
  nameDialog.error = '';
  nameDialog.open = true;
}

function openRenameSelected() {
  if (!selectedSingle.value) return;
  nameDialog.mode = selectedSingle.value.kind === 'folder' ? 'rename-folder' : 'rename-file';
  nameDialog.item = selectedSingle.value;
  nameDialog.error = '';
  nameDialog.open = true;
}

function closeNameDialog() {
  if (!nameDialog.loading) nameDialog.open = false;
}

async function saveName(name) {
  nameDialog.loading = true;
  nameDialog.error = '';
  try {
    if (nameDialog.mode === 'create-folder') {
      await api('/api/folders', {
        method: 'POST',
        headers: { 'X-CSRF-Token': auth.csrfToken },
        body: { name, parentId: currentFolder.value?.id ?? null }
      });
      announce(`Pasta “${name}” criada.`);
      await refreshWorkspace({ tree: true });
    } else if (nameDialog.mode === 'rename-folder') {
      await api(`/api/folders/${nameDialog.item.id}`, {
        method: 'PATCH',
        headers: { 'X-CSRF-Token': auth.csrfToken },
        body: { name }
      });
      announce('Pasta renomeada.');
      clearSelection();
      await refreshWorkspace({ tree: true, context: true });
    } else {
      await api(`/api/files/${nameDialog.item.id}`, {
        method: 'PATCH',
        headers: { 'X-CSRF-Token': auth.csrfToken },
        body: { originalName: name }
      });
      announce('Arquivo renomeado.');
      clearSelection();
      await loadItems();
    }
    nameDialog.open = false;
  } catch (caught) {
    nameDialog.error =
      caught.fields?.name ?? caught.fields?.originalName ?? caught.message;
  } finally {
    nameDialog.loading = false;
  }
}

function openMoveSelected() {
  if (!selectedItems.value.length) return;
  moveDialog.error = '';
  moveDialog.open = true;
}

function closeMoveDialog() {
  if (!moveDialog.loading) moveDialog.open = false;
}

function descriptors(chosen) {
  return chosen.map(({ kind, id }) => ({ kind, id }));
}

async function moveItems(chosen, destinationFolderId, { dialog = false } = {}) {
  if (!chosen.length) return;
  if (chosen.every((item) => item.folderId === destinationFolderId)) {
    if (dialog) moveDialog.open = false;
    announce('Os itens já estão neste local.');
    return;
  }
  busy.value = true;
  if (dialog) moveDialog.loading = true;
  if (dialog) moveDialog.error = '';
  error.value = '';
  try {
    await api('/api/drive/items/move', {
      method: 'POST',
      headers: { 'X-CSRF-Token': auth.csrfToken },
      body: { items: descriptors(chosen), destinationFolderId }
    });
    if (dialog) moveDialog.open = false;
    clearSelection();
    announce(`${chosen.length} ${chosen.length === 1 ? 'item movido' : 'itens movidos'}.`);
    await refreshWorkspace({ tree: true, context: true });
  } catch (caught) {
    if (dialog) moveDialog.error = caught.message;
    else error.value = caught.message;
  } finally {
    busy.value = false;
    if (dialog) moveDialog.loading = false;
  }
}

async function submitMove(destinationFolderId) {
  await moveItems([...selectedItems.value], destinationFolderId, { dialog: true });
}

async function removeSelected() {
  const chosen = [...selectedItems.value];
  if (!chosen.length) return;
  const accepted = await confirm({
    title: chosen.length === 1 ? 'Excluir item?' : `Excluir ${chosen.length} itens?`,
    message:
      'A exclusão é permanente. Pastas com conteúdo não serão removidas e nenhuma parte da seleção será processada em caso de conflito.',
    confirmLabel: chosen.length === 1 ? 'Excluir' : 'Excluir itens',
    cancelLabel: 'Cancelar',
    variant: 'danger'
  });
  if (!accepted) return;

  busy.value = true;
  error.value = '';
  try {
    await api('/api/drive/items/delete', {
      method: 'POST',
      headers: { 'X-CSRF-Token': auth.csrfToken },
      body: { items: descriptors(chosen) }
    });
    clearSelection();
    announce(`${chosen.length} ${chosen.length === 1 ? 'item excluído' : 'itens excluídos'}.`);
    await refreshWorkspace({ status: true, tree: true, context: true });
  } catch (caught) {
    error.value = caught.message;
  } finally {
    busy.value = false;
  }
}

function preview(item, event) {
  previewTrigger.value = event?.currentTarget ?? null;
  previewFile.value = { ...item, originalName: item.name };
}

function closePreview() {
  previewFile.value = null;
  requestAnimationFrame(() => previewTrigger.value?.focus?.());
}

function download(item) {
  const anchor = document.createElement('a');
  anchor.href = `/api/files/${item.id}/download`;
  anchor.download = item.name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

async function activateItem(item, event) {
  if (item.kind === 'folder') {
    await openFolder(item);
    return;
  }
  if (item.previewAvailable) preview(item, event);
  else download(item);
}

async function openSelected() {
  if (selectedSingle.value) await activateItem(selectedSingle.value);
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
    if (event.lengthComputable)
      item.progress = Math.round((event.loaded / event.total) * 100);
  };
  xhr.onload = async () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      item.status = 'concluído';
      item.progress = 100;
      const tasks = [loadStatus()];
      if ((currentFolder.value?.id ?? null) === targetFolderId) tasks.push(loadItems());
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

function cancelUpload(item) {
  item.xhr?.abort();
}

function retryUpload(item) {
  window.clearTimeout(item.dismissTimer);
  queue.value = queue.value.filter((candidate) => candidate.id !== item.id);
  upload(
    item.file,
    item.targetFolderId === null
      ? null
      : { id: item.targetFolderId, name: item.targetFolderName }
  );
}

function transferHasFiles(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

function transferHasInternalItems(event) {
  return (
    internalDrag.active ||
    Array.from(event.dataTransfer?.types ?? []).includes(INTERNAL_DRAG_TYPE)
  );
}

function onExternalDragEnter(event) {
  if (transferHasFiles(event)) externalDragDepth.value += 1;
}

function onExternalDragLeave(event) {
  if (transferHasFiles(event))
    externalDragDepth.value = Math.max(0, externalDragDepth.value - 1);
}

function onWorkspaceDragOver(event) {
  if (transferHasFiles(event)) event.dataTransfer.dropEffect = 'copy';
}

async function onWorkspaceDrop(event) {
  externalDragDepth.value = 0;
  if (event.dataTransfer?.files?.length) {
    addFiles(event.dataTransfer.files);
    return;
  }
  if (transferHasInternalItems(event)) await dropOnDestination(currentFolder.value, event);
}

function startInternalDrag(item, index, event) {
  const chosen = isSelected(item) ? [...selectedItems.value] : [item];
  if (!isSelected(item)) selectOnly(item, index);
  internalDrag.active = true;
  internalDrag.items = chosen;
  internalDrag.dropTargetId = null;
  internalDrag.treeWasOpen = showFolderTree.value;
  showFolderTree.value = true;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData(INTERNAL_DRAG_TYPE, JSON.stringify(descriptors(chosen)));
  event.dataTransfer.setData(
    'text/plain',
    chosen.length === 1 ? chosen[0].name : `${chosen[0].name} + ${chosen.length - 1} itens`
  );
}

function resetInternalDrag() {
  internalDrag.active = false;
  internalDrag.items = [];
  internalDrag.dropTargetId = null;
  showFolderTree.value = internalDrag.treeWasOpen;
  internalDrag.treeWasOpen = false;
}

function endInternalDrag() {
  window.setTimeout(resetInternalDrag, 0);
}

function destinationId(folder) {
  return folder?.id ?? null;
}

function destinationPath(folder) {
  return folder?.path ?? folder?.itemPath ?? '';
}

function invalidDestination(folder) {
  const id = destinationId(folder);
  if (internalDrag.items.length && internalDrag.items.every((item) => item.folderId === id))
    return true;
  const path = destinationPath(folder);
  return internalDrag.items.some(
    (item) =>
      item.kind === 'folder' &&
      (item.id === id || path === item.itemPath || path.startsWith(`${item.itemPath} / `))
  );
}

function onDestinationDragOver(folder, event) {
  if (!transferHasInternalItems(event)) return;
  if (invalidDestination(folder)) {
    event.dataTransfer.dropEffect = 'none';
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  internalDrag.dropTargetId = folder?.id ?? 0;
}

function onDestinationDragLeave(folder, event) {
  if (event.currentTarget?.contains(event.relatedTarget)) return;
  const id = folder?.id ?? 0;
  if (internalDrag.dropTargetId === id) internalDrag.dropTargetId = null;
}

async function dropOnDestination(folder, event) {
  if (!transferHasInternalItems(event) || invalidDestination(folder)) return;
  event.preventDefault();
  event.stopPropagation();
  const chosen = [...internalDrag.items];
  const id = destinationId(folder);
  internalDrag.dropTargetId = folder?.id ?? 0;
  await moveItems(chosen, id);
  resetInternalDrag();
}

function typingTarget(target) {
  return target instanceof Element && Boolean(
    target.closest('input, textarea, select, button, a, [contenteditable="true"]')
  );
}

async function onKeydown(event) {
  if (dialogsOpen.value || typingTarget(event.target)) return;
  if (event.key === 'Escape' && selectedItems.value.length) {
    event.preventDefault();
    clearSelection();
  } else if (event.key === 'Delete' && selectedItems.value.length) {
    event.preventDefault();
    await removeSelected();
  } else if (event.key === 'F2' && selectedSingle.value) {
    event.preventDefault();
    openRenameSelected();
  } else if (event.key === 'Enter' && selectedSingle.value) {
    event.preventDefault();
    await openSelected();
  }
}

watch(
  [
    query,
    searchCurrentFolder,
    sort,
    () => filters.from,
    () => filters.to,
    () => filters.minSizeMb,
    () => filters.maxSizeMb,
    () => filters.type
  ],
  scheduleItemsLoad
);
watch(page, () => {
  clearSelection();
  loadItems();
});

onMounted(async () => {
  document.addEventListener('keydown', onKeydown);
  await Promise.all([loadStatus(), loadFolderTree(), loadFolderContext(), loadItems()]);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  itemRequest?.abort();
  window.clearTimeout(searchTimer);
  window.clearTimeout(noticeTimer);
  queue.value.forEach((item) => window.clearTimeout(item.dismissTimer));
  queue.value.filter((item) => item.status === 'enviando').forEach(cancelUpload);
});
</script>

<template>
  <AppShell>
    <section
      class="relative flex min-h-[calc(100vh-8rem)] flex-col"
      @dragenter.prevent="onExternalDragEnter"
      @dragover.prevent="onWorkspaceDragOver"
      @dragleave.prevent="onExternalDragLeave"
      @drop.prevent="onWorkspaceDrop"
    >
      <div
        v-if="externalDragging"
        class="pointer-events-none absolute inset-0 z-50 grid place-items-center rounded-xl border-2 border-dashed border-accent bg-canvas/95 p-6 backdrop-blur-sm"
        role="status"
        aria-live="polite"
      >
        <div class="text-center">
          <span class="mx-auto flex size-14 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Upload :size="28" aria-hidden="true" />
          </span>
          <h2 class="mt-4 text-lg font-semibold">Solte para importar</h2>
          <p class="mt-1 text-sm text-muted">Destino: {{ currentFolderLabel }}</p>
        </div>
      </div>

      <div class="sticky top-16 z-20 -mx-1 bg-canvas/95 px-1 pb-3 backdrop-blur">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-center">
          <nav aria-label="Caminho da pasta" class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm">
            <button
              type="button"
              class="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-muted hover:bg-elevated hover:text-foreground"
              :class="[
                !currentFolder ? 'font-medium text-foreground' : '',
                internalDrag.dropTargetId === 0 ? 'bg-accent/15 ring-2 ring-accent' : ''
              ]"
              @click="openFolder(null)"
              @dragover.prevent.stop="onDestinationDragOver(null, $event)"
              @dragleave.stop="onDestinationDragLeave(null, $event)"
              @drop.prevent.stop="dropOnDestination(null, $event)"
            >
              <Home :size="15" aria-hidden="true" />Meu Drive
            </button>
            <template v-for="folder in currentPath" :key="folder.id">
              <ChevronRight class="shrink-0 text-muted" :size="15" aria-hidden="true" />
              <button
                type="button"
                class="max-w-52 shrink-0 truncate rounded-md px-2 py-1.5 text-muted hover:bg-elevated hover:text-foreground"
                :class="[
                  folder.id === currentFolder?.id ? 'font-medium text-foreground' : '',
                  internalDrag.dropTargetId === folder.id ? 'bg-accent/15 ring-2 ring-accent' : ''
                ]"
                @click="openFolder(folder)"
                @dragover.prevent.stop="onDestinationDragOver(folder, $event)"
                @dragleave.stop="onDestinationDragLeave(folder, $event)"
                @drop.prevent.stop="dropOnDestination(folder, $event)"
              >
                {{ folder.name }}
              </button>
            </template>
          </nav>

          <label class="relative block w-full xl:w-80">
            <span class="sr-only">Buscar itens por nome</span>
            <Search class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" :size="16" aria-hidden="true" />
            <input
              v-model="query"
              type="search"
              class="min-h-10 w-full rounded-md border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="Buscar no Drive"
            />
          </label>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-2 py-2">
          <AppButton variant="secondary" :disabled="busy" @click="openCreateFolder">
            <FolderPlus :size="16" aria-hidden="true" />Nova pasta
          </AppButton>
          <AppButton :disabled="busy" @click="uploadInput?.click()">
            <Upload :size="16" aria-hidden="true" />Importar
          </AppButton>
          <input ref="uploadInput" class="sr-only" type="file" multiple @change="selectFiles" />

          <template v-if="selectedItems.length">
            <span class="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
            <span class="px-1 text-xs font-medium text-muted">{{ selectedItems.length }} selecionado(s)</span>
            <AppButton v-if="selectedSingle" variant="secondary" :disabled="busy" @click="openSelected">
              <Eye :size="16" aria-hidden="true" />Abrir
            </AppButton>
            <AppButton v-if="selectedSingle" variant="secondary" :disabled="busy" @click="openRenameSelected">
              <Pencil :size="16" aria-hidden="true" />Renomear
            </AppButton>
            <AppButton variant="secondary" :disabled="busy" @click="openMoveSelected">
              <Move :size="16" aria-hidden="true" />Mover
            </AppButton>
            <a
              v-if="selectedSingle?.kind === 'file'"
              :href="`/api/files/${selectedSingle.id}/download`"
              class="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-elevated px-3 text-sm font-medium hover:bg-border"
            >
              <Download :size="16" aria-hidden="true" />Baixar
            </a>
            <AppButton variant="danger" :disabled="busy" @click="removeSelected">
              <Trash2 :size="16" aria-hidden="true" />Excluir
            </AppButton>
            <button type="button" class="rounded-md px-2 py-2 text-xs text-muted hover:bg-elevated hover:text-foreground" @click="clearSelection">
              Limpar seleção
            </button>
          </template>

          <div class="ml-auto flex items-center gap-2">
            <label v-if="query.trim()" class="hidden items-center gap-2 text-xs text-muted lg:inline-flex">
              <input v-model="searchCurrentFolder" type="checkbox" class="size-4 rounded border-border" />
              Somente nesta pasta
            </label>
            <div class="relative">
              <AppButton
                variant="secondary"
                :aria-expanded="showFilters"
                aria-controls="drive-filter-popover"
                @click="showFilters = !showFilters"
              >
                <Filter :size="16" aria-hidden="true" />Filtrar
                <span v-if="activeFilters.length" class="rounded-full bg-accent px-1.5 py-0.5 text-[10px] leading-none text-white">{{ activeFilters.length }}</span>
              </AppButton>
              <DriveFilterPopover
                id="drive-filter-popover"
                :open="showFilters"
                :filters="filters"
                :active-count="activeFilters.length"
                @close="showFilters = false"
                @change="changeFilter"
                @clear="clearFilters"
              />
            </div>
            <div class="relative">
              <AppButton variant="secondary" :aria-expanded="showFolderTree" @click="showFolderTree = !showFolderTree">
                <FolderTree :size="16" aria-hidden="true" />Pastas
              </AppButton>
              <DriveFolderTree
                :open="showFolderTree"
                :folders="folderTreeItems"
                :current-folder-id="currentFolder?.id ?? null"
                :drop-target-folder-id="internalDrag.dropTargetId"
                @close="showFolderTree = false"
                @open-folder="openFolder"
                @drag-over="onDestinationDragOver"
                @drag-leave="onDestinationDragLeave"
                @drop="dropOnDestination"
              />
            </div>
          </div>
        </div>

        <div v-if="activeFilters.length" class="mt-2 flex gap-2 overflow-x-auto pb-1">
          <button
            v-for="filter in activeFilters"
            :key="filter.key"
            type="button"
            class="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted hover:text-foreground"
            :aria-label="`Remover filtro ${filter.label}`"
            @click="clearFilter(filter.key)"
          >
            {{ filter.label }}<X :size="13" aria-hidden="true" />
          </button>
        </div>
      </div>

      <p v-if="notice" class="mb-2 rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-600" role="status">
        {{ notice }}
      </p>
      <p v-if="error" class="mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500" role="alert">
        {{ error }}
      </p>

      <section class="flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface" :aria-busy="loading">
        <div class="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-xs text-muted" aria-live="polite">
          <span>{{ loading ? 'Carregando…' : `${total} ${total === 1 ? 'item' : 'itens'}` }}</span>
          <span>{{ query.trim() && !searchCurrentFolder ? 'Resultados em todo o Drive' : currentFolderLabel }}</span>
        </div>

        <div v-if="loading" class="grid flex-1 place-items-center p-8 text-sm text-muted">
          Carregando conteúdo…
        </div>
        <div v-else-if="items.length === 0" class="grid flex-1 place-items-center p-10 text-center text-sm text-muted">
          <div>
            <p class="font-medium text-foreground">{{ query.trim() || activeFilters.length ? 'Nenhum item encontrado' : 'Esta pasta está vazia' }}</p>
            <p class="mt-1">{{ query.trim() || activeFilters.length ? 'Ajuste a busca ou remova filtros.' : 'Crie uma pasta, importe arquivos ou arraste-os para esta área.' }}</p>
          </div>
        </div>
        <DriveTable
          v-else
          class="flex-1"
          :items="items"
          :selected-keys="selectedKeys"
          :all-selected="allPageSelected"
          :some-selected="somePageSelected"
          :sort="sort"
          :searching="Boolean(query.trim())"
          :drop-target-folder-id="internalDrag.dropTargetId"
          @select="select"
          @toggle="toggle"
          @toggle-page="togglePage"
          @activate="activateItem"
          @sort="changeSort"
          @drag-start="startInternalDrag"
          @drag-end="endInternalDrag"
          @drag-over-folder="onDestinationDragOver"
          @drag-leave-folder="onDestinationDragLeave"
          @drop-folder="dropOnDestination"
        />

        <div v-if="total > DRIVE_PAGE_SIZE" class="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-muted">
          <span>Página {{ page + 1 }} de {{ Math.ceil(total / DRIVE_PAGE_SIZE) }}</span>
          <div class="flex gap-2">
            <AppButton variant="secondary" :disabled="page === 0 || loading" @click="page -= 1">Anterior</AppButton>
            <AppButton variant="secondary" :disabled="(page + 1) * DRIVE_PAGE_SIZE >= total || loading" @click="page += 1">Próxima</AppButton>
          </div>
        </div>

        <DriveStorageBar
          :status="storageStatus"
          :loading="statusLoading"
          :item-count="total"
          :selected-count="selectedItems.length"
        />
      </section>
    </section>

    <section v-if="queue.length" class="fixed bottom-14 right-4 z-40 max-h-72 w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-2xl" aria-label="Fila de uploads">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-sm font-semibold">Uploads</h2>
        <span class="text-xs text-muted">{{ queue.length }} na fila</span>
      </div>
      <ul class="mt-2 divide-y divide-border">
        <li v-for="item in queue" :key="item.id" class="py-2.5">
          <div class="flex items-start gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex justify-between gap-2 text-xs">
                <p class="truncate font-medium" :title="item.file.name">{{ item.file.name }}</p>
                <span class="shrink-0 text-muted">{{ item.progress }}%</span>
              </div>
              <div class="mt-1.5 h-1 overflow-hidden rounded bg-elevated" role="progressbar" :aria-label="`Upload de ${item.file.name}`" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="item.progress">
                <div class="h-full bg-accent" :style="{ width: `${item.progress}%` }" />
              </div>
              <p class="mt-1 text-[11px] text-muted" aria-live="polite">{{ item.status }} · {{ item.targetFolderName }}<span v-if="item.error"> · {{ item.error }}</span></p>
            </div>
            <button v-if="item.status === 'enviando'" type="button" class="rounded p-1.5 text-muted hover:bg-elevated hover:text-foreground" :aria-label="`Cancelar upload de ${item.file.name}`" @click="cancelUpload(item)">
              <X :size="15" aria-hidden="true" />
            </button>
            <button v-else-if="item.status === 'erro' || item.status === 'cancelado'" type="button" class="rounded p-1.5 text-muted hover:bg-elevated hover:text-foreground" :aria-label="`Repetir upload de ${item.file.name}`" @click="retryUpload(item)">
              <RotateCcw :size="15" aria-hidden="true" />
            </button>
          </div>
        </li>
      </ul>
    </section>

    <FolderNameDialog
      v-if="nameDialog.open"
      :title="nameDialog.mode === 'create-folder' ? 'Nova pasta' : nameDialog.mode === 'rename-folder' ? 'Renomear pasta' : 'Renomear arquivo'"
      :description="nameDialog.mode === 'create-folder' ? `A pasta será criada em “${currentFolderLabel}”.` : 'Informe o novo nome do item selecionado.'"
      :field-label="nameDialog.mode === 'rename-file' ? 'Nome do arquivo' : 'Nome da pasta'"
      :initial-name="nameDialog.item?.name ?? ''"
      :submit-label="nameDialog.mode === 'create-folder' ? 'Criar pasta' : 'Salvar nome'"
      :loading="nameDialog.loading"
      :error="nameDialog.error"
      @close="closeNameDialog"
      @submit="saveName"
    />
    <DriveMoveDialog
      v-if="moveDialog.open"
      :items="selectedItems"
      :folders="folderTreeItems"
      :current-folder-id="currentFolder?.id ?? null"
      :loading="moveDialog.loading"
      :error="moveDialog.error"
      @close="closeMoveDialog"
      @submit="submitMove"
    />
    <ImagePreviewModal v-if="previewFile" :file="previewFile" @close="closePreview" />
  </AppShell>
</template>
