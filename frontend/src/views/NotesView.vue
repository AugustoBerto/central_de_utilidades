<script setup>
/* eslint-disable vue/no-v-html -- renderMarkdown escapa a entrada e produz HTML controlado. */
import {
  Bold,
  Code2,
  Download,
  FilePlus2,
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
  Search,
  Strikethrough,
  Trash2,
  Underline
} from 'lucide-vue-next';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import AppButton from '@/components/base/AppButton.vue';
import AppModal from '@/components/base/AppModal.vue';
import AppShell from '@/components/layout/AppShell.vue';
import { excerpt, renderMarkdown } from '@/features/notes/markdown';
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
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const fieldErrors = ref({});
const modal = ref(null);
const selected = ref(null);
const editor = ref({ title: '', content: '', updatedAt: null });
const textarea = ref(null);
const fileInput = ref(null);
const savedSnapshot = ref('');
let searchTimer;

const isEditing = computed(() => modal.value === 'edit' || modal.value === 'create');
const dirty = computed(() => isEditing.value && JSON.stringify(editor.value) !== savedSnapshot.value);
const modalTitle = computed(() => modal.value === 'create' ? 'Nova nota' : modal.value === 'edit' ? 'Editar nota' : selected.value?.title || 'Sem título');
const renderedContent = computed(() => renderMarkdown(selected.value?.content ?? ''));
const renderedEditor = computed(() => renderMarkdown(editor.value.content));

function snapshot() { savedSnapshot.value = JSON.stringify(editor.value); }
function formatDate(value) { return new Date(value).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }); }
function setView(mode) { viewMode.value = mode; localStorage.setItem('notes-view-mode', mode); }
function safeFileName(value) {
  return ((value || 'nota').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().replace(/\s+/g, '-').slice(0, 120) || 'nota');
}
function downloadNote() {
  if (!selected.value) return;
  const title = selected.value.title?.trim() || 'Sem título';
  const blob = new Blob([`${title}\n\n${selected.value.content}\n\nAtualizada em: ${formatDate(selected.value.updatedAt)}\n`], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: `${safeFileName(selected.value.title)}.txt` });
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

async function load() {
  loading.value = true; error.value = '';
  try {
    const params = new URLSearchParams({ q: query.value, sort: sort.value });
    if (from.value) params.set('from', from.value);
    if (to.value) params.set('to', to.value);
    notes.value = (await api(`/api/notes?${params}`)).notes;
  } catch (caught) { error.value = caught.message; } finally { loading.value = false; }
}

async function open(note) {
  error.value = ''; fieldErrors.value = {};
  try { selected.value = (await api(`/api/notes/${note.id}`)).note; modal.value = 'view'; }
  catch (caught) { error.value = caught.message; }
}
function beginCreate(initial = { title: '', content: '' }) {
  selected.value = null;
  editor.value = { title: initial.title, content: initial.content, updatedAt: null };
  fieldErrors.value = {}; error.value = ''; editorTab.value = 'write'; modal.value = 'create'; snapshot();
  nextTick(() => textarea.value?.focus());
}
function beginEdit() {
  editor.value = { title: selected.value.title, content: selected.value.content, updatedAt: selected.value.updatedAt };
  fieldErrors.value = {}; editorTab.value = 'write'; modal.value = 'edit'; snapshot();
  nextTick(() => textarea.value?.focus());
}
function closeModal() {
  if (dirty.value && !window.confirm('Descartar alterações não salvas desta nota?')) return;
  modal.value = null; selected.value = null; fieldErrors.value = {};
}

async function importFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['txt', 'md'].includes(extension)) { error.value = 'Selecione um arquivo .txt ou .md.'; return; }
  try {
    let content = await file.text();
    content = content.replace(/^\uFEFF/, '');
    if (content.length > 100000) { error.value = 'O arquivo excede o limite de 100.000 caracteres.'; return; }
    const title = file.name.replace(/\.(txt|md)$/i, '');
    beginCreate({ title, content });
    notice.value = `Arquivo “${file.name}” carregado. Revise antes de salvar.`;
  } catch { error.value = 'Não foi possível ler o arquivo selecionado.'; }
}

function replaceSelection(before, after = before, placeholder = 'texto') {
  const input = textarea.value;
  const start = input?.selectionStart ?? editor.value.content.length;
  const end = input?.selectionEnd ?? start;
  const value = editor.value.content;
  const selectedText = value.slice(start, end) || placeholder;
  editor.value.content = `${value.slice(0, start)}${before}${selectedText}${after}${value.slice(end)}`;
  nextTick(() => { input?.focus(); input?.setSelectionRange(start + before.length, start + before.length + selectedText.length); });
}
function prefixLines(prefix) {
  const input = textarea.value;
  const value = editor.value.content;
  const start = input?.selectionStart ?? 0;
  const end = input?.selectionEnd ?? start;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEndIndex = value.indexOf('\n', end);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const block = value.slice(lineStart, lineEnd).split('\n').map((line) => `${prefix}${line}`).join('\n');
  editor.value.content = `${value.slice(0, lineStart)}${block}${value.slice(lineEnd)}`;
  nextTick(() => { input?.focus(); input?.setSelectionRange(lineStart, lineStart + block.length); });
}
function insertLink() { replaceSelection('[', '](https://)', 'texto do link'); }
function insertCodeBlock() { replaceSelection('```\n', '\n```', 'código'); }
function onEditorKeydown(event) {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() === 'b') { event.preventDefault(); replaceSelection('**'); }
  if (event.key.toLowerCase() === 'i') { event.preventDefault(); replaceSelection('*'); }
}

async function save() {
  saving.value = true; error.value = ''; fieldErrors.value = {};
  try {
    const body = { ...editor.value, title: editor.value.title.trim(), content: editor.value.content.trim() };
    const headers = { 'X-CSRF-Token': auth.csrfToken };
    const result = modal.value === 'create'
      ? await api('/api/notes', { method: 'POST', headers, body })
      : await api(`/api/notes/${selected.value.id}`, { method: 'PATCH', headers, body });
    selected.value = result.note; editor.value = { ...result.note }; snapshot(); modal.value = 'view'; notice.value = 'Nota salva.'; await load();
  } catch (caught) {
    fieldErrors.value = caught.fields ?? {};
    error.value = caught instanceof ApiError && caught.code === 'NOTE_CONFLICT' ? 'Esta nota mudou em outro contexto. Feche e abra novamente antes de salvar.' : caught.message;
  } finally { saving.value = false; }
}
async function remove() {
  if (!selected.value || !window.confirm(`Excluir “${selected.value.title || 'Sem título'}”? Esta ação não pode ser desfeita.`)) return;
  saving.value = true; error.value = '';
  try {
    await api(`/api/notes/${selected.value.id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': auth.csrfToken } });
    modal.value = null; selected.value = null; notice.value = 'Nota excluída.'; await load();
  } catch (caught) { error.value = caught.message; } finally { saving.value = false; }
}

watch([query, sort, from, to], () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(load, 250); });
onMounted(load);
onBeforeUnmount(() => window.clearTimeout(searchTimer));
</script>

<template>
  <AppShell>
    <section class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div><h2 class="font-semibold">Registro de notas</h2><p class="mt-1 text-sm text-muted">Registre notas operacionais com Markdown.</p></div>
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
      <div v-else :class="viewMode === 'cards' ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'divide-y divide-border rounded-lg border border-border bg-surface'">
        <button v-for="note in notes" :key="note.id" class="group text-left" :class="viewMode === 'cards' ? 'rounded-lg border border-border bg-surface p-4 hover:border-accent hover:bg-elevated' : 'w-full p-4 hover:bg-elevated'" @click="open(note)"><h3 class="line-clamp-2 font-medium">{{ note.title || 'Sem título' }}</h3><p class="mt-3 line-clamp-3 text-sm text-muted">{{ excerpt(note.content) }}</p><p class="mt-4 text-xs text-muted">Atualizada em {{ formatDate(note.updatedAt) }}</p></button>
      </div>
    </section>

    <AppModal v-if="modal" :title="modalTitle" :aria-label="modalTitle" max-width-class="max-w-6xl" @close="closeModal">
      <template #header><h2 class="truncate text-lg font-semibold tracking-tight">{{ modalTitle }}</h2><p v-if="selected && modal === 'view'" class="mt-1 text-xs text-muted">Atualizada em {{ formatDate(selected.updatedAt) }}</p></template>

      <div v-if="modal === 'view'" class="space-y-5 p-5 sm:p-6">
        <article class="note-reading-panel note-markdown" v-html="renderedContent" />
        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"><AppButton variant="danger" :disabled="saving" @click="remove"><Trash2 :size="16" />Excluir</AppButton><div class="flex flex-wrap gap-3"><AppButton variant="secondary" @click="downloadNote"><Download :size="16" />Baixar .txt</AppButton><AppButton @click="beginEdit"><Pencil :size="16" />Editar</AppButton></div></div>
      </div>

      <form v-else class="space-y-4 p-5 sm:p-6" @submit.prevent="save">
        <label class="block text-sm"><span>Título <span class="text-muted">(opcional)</span></span><input v-model="editor.title" class="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2" :aria-invalid="Boolean(fieldErrors.title)" maxlength="160" placeholder="Ex.: Procedimento de deploy"><span v-if="fieldErrors.title" class="mt-1 block text-xs text-red-300">{{ fieldErrors.title }}</span></label>
        <div class="flex gap-1 rounded-md border border-border bg-elevated p-1 lg:hidden"><button type="button" class="flex-1 rounded px-3 py-2 text-sm" :class="editorTab === 'write' ? 'bg-canvas text-foreground' : 'text-muted'" @click="editorTab = 'write'">Escrever</button><button type="button" class="flex-1 rounded px-3 py-2 text-sm" :class="editorTab === 'preview' ? 'bg-canvas text-foreground' : 'text-muted'" @click="editorTab = 'preview'">Visualizar</button></div>
        <div class="grid min-h-[28rem] gap-4 lg:grid-cols-2">
          <div v-show="editorTab === 'write' || $screen === undefined" class="min-w-0 lg:block">
            <div class="flex flex-wrap gap-1 rounded-t-md border border-border bg-elevated p-2" aria-label="Formatação Markdown">
              <AppButton variant="secondary" type="button" title="Título" @click="prefixLines('## ')"><Heading2 :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Negrito (Ctrl+B)" @click="replaceSelection('**')"><Bold :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Itálico (Ctrl+I)" @click="replaceSelection('*')"><Italic :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Sublinhado" @click="replaceSelection('++')"><Underline :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Tachado" @click="replaceSelection('~~')"><Strikethrough :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Lista" @click="prefixLines('- ')"><List :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Lista numerada" @click="prefixLines('1. ')"><ListOrdered :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Citação" @click="prefixLines('> ')"><Quote :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Código" @click="insertCodeBlock"><Code2 :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Link" @click="insertLink"><Link2 :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Separador" @click="prefixLines('---\n')"><Minus :size="16" /></AppButton>
            </div>
            <textarea ref="textarea" v-model="editor.content" class="min-h-[25rem] w-full resize-y rounded-b-md border border-t-0 border-border bg-canvas px-3 py-3 font-mono text-sm leading-6" :aria-invalid="Boolean(fieldErrors.content)" maxlength="100000" required placeholder="Escreva em Markdown…" @keydown="onEditorKeydown" />
            <span v-if="fieldErrors.content" class="mt-1 block text-xs text-red-300">{{ fieldErrors.content }}</span>
          </div>
          <div v-show="editorTab === 'preview'" class="min-w-0 lg:block"><div class="note-reading-panel note-markdown h-full" v-html="renderedEditor" /></div>
        </div>
        <p v-if="error" class="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">{{ error }}</p>
        <div class="flex flex-wrap justify-end gap-3"><AppButton variant="secondary" type="button" :disabled="saving" @click="closeModal">Cancelar</AppButton><AppButton type="submit" :loading="saving">Salvar nota</AppButton></div>
      </form>
    </AppModal>
  </AppShell>
</template>

<style>
.note-reading-panel { min-height: 14rem; border: 1px solid rgb(var(--color-border) / .9); border-radius: .75rem; background: rgb(var(--color-canvas) / .72); padding: 1.5rem; box-shadow: inset 0 1px 0 rgb(255 255 255 / .025); }
.note-markdown { color: rgb(var(--color-foreground)); font-size: 1rem; line-height: 1.8; overflow-wrap: anywhere; }
.note-markdown > :first-child { margin-top: 0; }.note-markdown > :last-child { margin-bottom: 0; }
.note-markdown h1,.note-markdown h2,.note-markdown h3,.note-markdown h4,.note-markdown h5,.note-markdown h6 { font-weight: 700; line-height: 1.25; margin: 1.5rem 0 .65rem; }
.note-markdown h1 { font-size: 1.8rem; }.note-markdown h2 { font-size: 1.5rem; }.note-markdown h3 { font-size: 1.25rem; }
.note-markdown p { margin: .9rem 0; }.note-markdown ul { list-style: disc; }.note-markdown ol { list-style: decimal; }.note-markdown ul,.note-markdown ol { margin: .9rem 0; padding-left: 1.5rem; }
.note-markdown blockquote { margin: 1rem 0; border-left: 3px solid rgb(var(--color-accent)); padding-left: 1rem; color: rgb(var(--color-muted)); }
.note-markdown code { border-radius: .3rem; background: rgb(var(--color-elevated)); padding: .15rem .35rem; font-family: ui-monospace, monospace; font-size: .9em; }.note-markdown pre { overflow-x: auto; border: 1px solid rgb(var(--color-border)); border-radius: .6rem; background: rgb(var(--color-elevated)); padding: 1rem; }.note-markdown pre code { padding: 0; background: transparent; }
.note-markdown a { color: rgb(var(--color-accent)); text-decoration: underline; }.note-markdown hr { margin: 1.5rem 0; border-color: rgb(var(--color-border)); }
.note-table-wrap { overflow-x: auto; }.note-markdown table { width: 100%; border-collapse: collapse; }.note-markdown th,.note-markdown td { border: 1px solid rgb(var(--color-border)); padding: .5rem .7rem; text-align: left; }.note-markdown th { background: rgb(var(--color-elevated)); }
.note-task { list-style: none; }.note-task input { margin-right: .5rem; }.note-size-small { font-size: .875rem; }.note-size-large { font-size: 1.25rem; }.note-size-xlarge { font-size: 1.5rem; }
</style>
