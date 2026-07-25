<script setup>
import {
  Bold,
  Check,
  Clipboard,
  Code2,
  Download,
  FilePlus2,
  FileText,
  FileUp,
  Grid2X2,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pencil,
  Quote,
  Save as SaveIcon,
  Search,
  Strikethrough,
  Trash2,
  Underline
} from 'lucide-vue-next';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import AppButton from '@/components/base/AppButton.vue';
import AppModal from '@/components/base/AppModal.vue';
import AppShell from '@/components/layout/AppShell.vue';
import MarkdownEditor from '@/features/notes/MarkdownEditor.vue';
import MarkdownViewer from '@/features/notes/MarkdownViewer.vue';
import { notePreview } from '@/features/notes/markdown';
import { ApiError, api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const notes = ref([]);
const query = ref('');
const sort = ref('updatedAt:desc');
const from = ref('');
const to = ref('');
const viewMode = ref(localStorage.getItem('notes-view-mode') === 'list' ? 'list' : 'cards');
const editorTab = ref('write');
const desktopMode = ref('split');
const loading = ref(true);
const saving = ref(false);
const copying = ref(false);
const error = ref('');
const notice = ref('');
const fieldErrors = ref({});
const modal = ref(null);
const selected = ref(null);
const editor = ref({ title: '', content: '', updatedAt: null });
const markdownEditor = ref(null);
const fileInput = ref(null);
const savedSnapshot = ref('');
let searchTimer;
let copyTimer;

const isEditing = computed(() => modal.value === 'edit' || modal.value === 'create');
const dirty = computed(() => isEditing.value && JSON.stringify(editor.value) !== savedSnapshot.value);
const modalTitle = computed(() => modal.value === 'create' ? 'Nova nota' : modal.value === 'edit' ? 'Editar nota' : selected.value?.title || 'Sem título');
const activeContent = computed(() => isEditing.value ? editor.value.content : selected.value?.content ?? '');

function snapshot() { savedSnapshot.value = JSON.stringify(editor.value); }
function formatDate(value) { return new Date(value).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }); }
function setView(mode) { viewMode.value = mode; localStorage.setItem('notes-view-mode', mode); }
function preview(note, limit) { return notePreview(note.content, limit) || 'Nota sem conteúdo textual para pré-visualização.'; }
function safeFileName(value) {
  return ((value || 'nota').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().replace(/\s+/g, '-').slice(0, 120) || 'nota');
}
function triggerDownload(extension, content, mimeType) {
  const source = selected.value ?? editor.value;
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: `${safeFileName(source.title)}.${extension}` });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function downloadMarkdown() { triggerDownload('md', activeContent.value, 'text/markdown'); }
function downloadText() {
  const source = selected.value ?? editor.value;
  const suffix = source.updatedAt ? `\n\nAtualizada em: ${formatDate(source.updatedAt)}\n` : '\n';
  triggerDownload('txt', `${source.title?.trim() || 'Sem título'}\n\n${activeContent.value}${suffix}`, 'text/plain');
}
async function copyMarkdown() {
  try {
    await navigator.clipboard.writeText(activeContent.value);
    copying.value = true;
    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => { copying.value = false; }, 1600);
  } catch {
    error.value = 'Não foi possível copiar o conteúdo.';
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams({ q: query.value, sort: sort.value });
    if (from.value) params.set('from', from.value);
    if (to.value) params.set('to', to.value);
    notes.value = (await api(`/api/notes?${params}`)).notes;
  } catch (caught) { error.value = caught.message; }
  finally { loading.value = false; }
}
async function open(note) {
  error.value = '';
  fieldErrors.value = {};
  try {
    selected.value = (await api(`/api/notes/${note.id}`)).note;
    modal.value = 'view';
  } catch (caught) { error.value = caught.message; }
}
function focusEditor() { nextTick(() => markdownEditor.value?.focus()); }
function beginCreate(initial = { title: '', content: '' }) {
  selected.value = null;
  editor.value = { title: initial.title, content: initial.content, updatedAt: null };
  fieldErrors.value = {};
  error.value = '';
  editorTab.value = 'write';
  desktopMode.value = 'split';
  modal.value = 'create';
  snapshot();
  focusEditor();
}
function beginEdit() {
  editor.value = { title: selected.value.title, content: selected.value.content, updatedAt: selected.value.updatedAt };
  fieldErrors.value = {};
  editorTab.value = 'write';
  desktopMode.value = 'split';
  modal.value = 'edit';
  snapshot();
  focusEditor();
}
function closeModal() {
  if (dirty.value && !window.confirm('Descartar alterações não salvas desta nota?')) return;
  modal.value = null;
  selected.value = null;
  fieldErrors.value = {};
}
async function importFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['txt', 'md'].includes(extension)) { error.value = 'Selecione um arquivo .txt ou .md.'; return; }
  try {
    const content = (await file.text()).replace(/^\uFEFF/, '');
    if (content.length > 100000) { error.value = 'O arquivo excede o limite de 100.000 caracteres.'; return; }
    beginCreate({ title: file.name.replace(/\.(txt|md)$/i, ''), content });
    notice.value = `Arquivo “${file.name}” carregado. Revise antes de salvar.`;
  } catch { error.value = 'Não foi possível ler o arquivo selecionado.'; }
}

function replaceSelection(before, after = before, placeholder = 'texto') {
  markdownEditor.value?.replaceSelection(before, after, placeholder);
}
function prefixLines(prefix) {
  markdownEditor.value?.prefixLines(prefix);
}
function insertLink() { replaceSelection('[', '](https://)', 'texto do link'); }
function insertCodeBlock() { replaceSelection('```bash\n', '\n```', 'comando'); }

async function save() {
  if (saving.value) return;
  saving.value = true;
  error.value = '';
  fieldErrors.value = {};
  try {
    const body = { ...editor.value, title: editor.value.title.trim(), content: editor.value.content.trim() };
    const headers = { 'X-CSRF-Token': auth.csrfToken };
    const result = modal.value === 'create'
      ? await api('/api/notes', { method: 'POST', headers, body })
      : await api(`/api/notes/${selected.value.id}`, { method: 'PATCH', headers, body });
    selected.value = result.note;
    editor.value = { ...result.note };
    snapshot();
    modal.value = 'view';
    notice.value = 'Nota salva.';
    await load();
  } catch (caught) {
    fieldErrors.value = caught.fields ?? {};
    error.value = caught instanceof ApiError && caught.code === 'NOTE_CONFLICT'
      ? 'Esta nota mudou em outro contexto. Feche e abra novamente antes de salvar.'
      : caught.message;
  } finally { saving.value = false; }
}
async function remove() {
  if (!selected.value || !window.confirm(`Excluir “${selected.value.title || 'Sem título'}”? Esta ação não pode ser desfeita.`)) return;
  saving.value = true;
  error.value = '';
  try {
    await api(`/api/notes/${selected.value.id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': auth.csrfToken } });
    modal.value = null;
    selected.value = null;
    notice.value = 'Nota excluída.';
    await load();
  } catch (caught) { error.value = caught.message; }
  finally { saving.value = false; }
}

watch([query, sort, from, to], () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(load, 250); });
onMounted(load);
onBeforeUnmount(() => { window.clearTimeout(searchTimer); window.clearTimeout(copyTimer); });
</script>

<template>
  <AppShell>
    <section class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="font-semibold">Registro de notas</h2>
          <p class="mt-1 text-sm text-muted">Documentos Markdown, procedimentos e registros operacionais.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <input ref="fileInput" class="sr-only" type="file" accept=".txt,.md,text/plain,text/markdown" @change="importFile">
          <AppButton variant="secondary" @click="fileInput?.click()"><FileUp :size="17" />Importar arquivo</AppButton>
          <AppButton @click="beginCreate()"><FilePlus2 :size="17" />Nova nota</AppButton>
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <label class="relative min-w-52 flex-1"><span class="sr-only">Buscar notas</span><Search class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" :size="16" /><input v-model="query" class="w-full rounded-md border border-border bg-canvas py-2 pl-9 pr-3 text-sm" placeholder="Buscar título ou conteúdo"></label>
        <label><span class="mb-1 block text-xs text-muted">Atualizada a partir de</span><input v-model="from" class="min-h-10 rounded-md border border-border bg-canvas px-3 text-sm" type="date"></label>
        <label><span class="mb-1 block text-xs text-muted">Atualizada até</span><input v-model="to" class="min-h-10 rounded-md border border-border bg-canvas px-3 text-sm" type="date"></label>
        <label><span class="mb-1 block text-xs text-muted">Ordenar</span><select v-model="sort" class="min-h-10 rounded-md border border-border bg-canvas px-3 text-sm"><option value="updatedAt:desc">Atualizadas recentemente</option><option value="updatedAt:asc">Atualizadas primeiro</option><option value="createdAt:desc">Criadas recentemente</option><option value="title:asc">Título, A–Z</option><option value="title:desc">Título, Z–A</option></select></label>
        <div class="flex gap-1 rounded-md border border-border bg-canvas p-1" aria-label="Visualização"><AppButton variant="secondary" :aria-pressed="viewMode === 'cards'" title="Blocos" @click="setView('cards')"><Grid2X2 :size="17" /><span class="sr-only">Exibir em blocos</span></AppButton><AppButton variant="secondary" :aria-pressed="viewMode === 'list'" title="Lista" @click="setView('list')"><List :size="17" /><span class="sr-only">Exibir em lista</span></AppButton></div>
      </div>

      <p v-if="error && !modal" class="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">{{ error }}</p>
      <p v-if="notice" class="rounded-md border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-200" role="status">{{ notice }}</p>
      <div v-if="loading" class="rounded-lg border border-border bg-surface p-8 text-sm text-muted">Carregando notas…</div>
      <div v-else-if="notes.length === 0" class="rounded-lg border border-border bg-surface p-10 text-center text-sm text-muted"><FilePlus2 class="mx-auto" :size="28" /><p class="mt-3">{{ query || from || to ? 'Nenhuma nota corresponde aos filtros.' : 'Nenhuma nota criada ainda.' }}</p></div>

      <div v-else-if="viewMode === 'cards'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <button v-for="note in notes" :key="note.id" class="group flex min-h-52 flex-col rounded-xl border border-border bg-surface p-5 text-left transition hover:-translate-y-0.5 hover:border-accent hover:bg-elevated focus-visible:outline-accent" @click="open(note)">
          <div class="flex items-start gap-3"><span class="rounded-md border border-border bg-elevated p-2 text-accent"><FileText :size="18" /></span><h3 class="line-clamp-2 pt-1 font-semibold">{{ note.title || 'Sem título' }}</h3></div>
          <p class="mt-4 line-clamp-4 flex-1 text-sm leading-6 text-muted">{{ preview(note, 240) }}</p>
          <div class="mt-5 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted"><span>Markdown</span><span>{{ formatDate(note.updatedAt) }}</span></div>
        </button>
      </div>

      <div v-else class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        <button v-for="note in notes" :key="note.id" class="group grid w-full gap-2 p-5 text-left hover:bg-elevated md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-6" @click="open(note)">
          <h3 class="line-clamp-1 font-semibold">{{ note.title || 'Sem título' }}</h3>
          <span class="text-xs text-muted md:text-right">{{ formatDate(note.updatedAt) }}</span>
          <p class="line-clamp-2 max-w-4xl text-sm leading-6 text-muted md:col-start-1">{{ preview(note, 320) }}</p>
          <span class="self-end text-xs text-muted md:col-start-2 md:text-right">Markdown</span>
        </button>
      </div>
    </section>

    <AppModal v-if="modal" :title="modalTitle" :aria-label="modalTitle" max-width-class="max-w-[96vw]" @close="closeModal">
      <template #header>
        <div class="flex min-w-0 flex-wrap items-start justify-between gap-3 pr-2">
          <div class="min-w-0">
            <h2 class="truncate text-lg font-semibold tracking-tight">{{ modalTitle }}</h2>
            <p class="mt-1 text-xs text-muted">
              <template v-if="selected && modal === 'view'">Atualizada em {{ formatDate(selected.updatedAt) }}</template>
              <template v-else>{{ dirty ? 'Alterações não salvas' : 'Sem alterações pendentes' }}</template>
            </p>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <template v-if="modal === 'view'">
              <AppButton variant="secondary" @click="copyMarkdown"><Check v-if="copying" :size="16" /><Clipboard v-else :size="16" />{{ copying ? 'Copiado' : 'Copiar' }}</AppButton>
              <AppButton variant="secondary" @click="downloadMarkdown"><Download :size="16" />.md</AppButton>
              <AppButton variant="secondary" @click="downloadText"><Download :size="16" />.txt</AppButton>
              <AppButton variant="danger" :disabled="saving" @click="remove"><Trash2 :size="16" />Excluir</AppButton>
              <AppButton @click="beginEdit"><Pencil :size="16" />Editar</AppButton>
            </template>
            <template v-else>
              <AppButton variant="secondary" type="button" :disabled="saving" @click="closeModal">Cancelar</AppButton>
              <AppButton :loading="saving" @click="save"><SaveIcon :size="16" />Salvar</AppButton>
            </template>
          </div>
        </div>
      </template>

      <div v-if="modal === 'view'" class="h-[calc(92vh-5.5rem)] overflow-y-auto bg-canvas/40 px-5 py-8 sm:px-8">
        <div class="mx-auto max-w-[980px] rounded-xl border border-border bg-canvas/80 p-6 shadow-inner sm:p-9">
          <MarkdownViewer :content="selected.content" />
        </div>
      </div>

      <form v-else class="flex h-[calc(92vh-5.5rem)] min-h-0 flex-col" @submit.prevent="save">
        <div class="shrink-0 space-y-3 border-b border-border bg-surface px-5 py-4 sm:px-6">
          <label class="block text-sm"><span>Título <span class="text-muted">(opcional)</span></span><input v-model="editor.title" class="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2" :aria-invalid="Boolean(fieldErrors.title)" maxlength="160" placeholder="Ex.: Procedimento de deploy"><span v-if="fieldErrors.title" class="mt-1 block text-xs text-red-300">{{ fieldErrors.title }}</span></label>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap gap-1" aria-label="Formatação Markdown">
              <AppButton variant="secondary" type="button" title="Título" @click="prefixLines('## ')"><Heading2 :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Negrito" @click="replaceSelection('**')"><Bold :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Itálico" @click="replaceSelection('*')"><Italic :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Sublinhado" @click="replaceSelection('++')"><Underline :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Tachado" @click="replaceSelection('~~')"><Strikethrough :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Lista" @click="prefixLines('- ')"><List :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Lista numerada" @click="prefixLines('1. ')"><ListOrdered :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Citação" @click="prefixLines('> ')"><Quote :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Bloco de código" @click="insertCodeBlock"><Code2 :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Link" @click="insertLink"><Link2 :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Separador" @click="prefixLines('---\n')"><Minus :size="16" /></AppButton>
            </div>
            <div class="hidden gap-1 rounded-md border border-border bg-canvas p-1 lg:flex"><button type="button" class="rounded px-3 py-1.5 text-xs" :class="desktopMode === 'write' ? 'bg-elevated text-foreground' : 'text-muted'" @click="desktopMode = 'write'">Editor</button><button type="button" class="rounded px-3 py-1.5 text-xs" :class="desktopMode === 'split' ? 'bg-elevated text-foreground' : 'text-muted'" @click="desktopMode = 'split'">Dividido</button><button type="button" class="rounded px-3 py-1.5 text-xs" :class="desktopMode === 'preview' ? 'bg-elevated text-foreground' : 'text-muted'" @click="desktopMode = 'preview'">Preview</button></div>
            <div class="flex gap-1 rounded-md border border-border bg-canvas p-1 lg:hidden"><button type="button" class="rounded px-3 py-1.5 text-xs" :class="editorTab === 'write' ? 'bg-elevated text-foreground' : 'text-muted'" @click="editorTab = 'write'">Escrever</button><button type="button" class="rounded px-3 py-1.5 text-xs" :class="editorTab === 'preview' ? 'bg-elevated text-foreground' : 'text-muted'" @click="editorTab = 'preview'">Visualizar</button></div>
          </div>
        </div>

        <div class="min-h-0 flex-1 bg-canvas/40 p-3 sm:p-4">
          <div class="grid h-full min-h-0 gap-3" :class="desktopMode === 'split' ? 'lg:grid-cols-2' : 'lg:grid-cols-1'">
            <div class="min-h-0" :class="[(editorTab === 'write' ? 'block' : 'hidden'), desktopMode === 'preview' ? 'lg:hidden' : 'lg:block']">
              <MarkdownEditor ref="markdownEditor" v-model="editor.content" aria-label="Conteúdo da nota em Markdown" @save="save" />
            </div>
            <div class="min-h-0 overflow-y-auto rounded-lg border border-border bg-canvas p-5 sm:p-7" :class="[(editorTab === 'preview' ? 'block' : 'hidden'), desktopMode === 'write' ? 'lg:hidden' : 'lg:block']">
              <MarkdownViewer :content="editor.content" />
            </div>
          </div>
        </div>
        <p v-if="fieldErrors.content" class="shrink-0 px-5 pb-2 text-xs text-red-300">{{ fieldErrors.content }}</p>
        <p v-if="error" class="mx-5 mb-3 shrink-0 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">{{ error }}</p>
      </form>
    </AppModal>
  </AppShell>
</template>
