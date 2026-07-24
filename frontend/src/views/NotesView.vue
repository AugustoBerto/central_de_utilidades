<script setup>
/* eslint-disable vue/no-v-html -- renderMarkdown escapa entrada e gera somente marcação limitada. */
import {
  Bold,
  Eye,
  FilePlus2,
  Grid2X2,
  Italic,
  List,
  Pencil,
  Search,
  TextCursorInput,
  Trash2,
  Underline,
  X
} from 'lucide-vue-next';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import AppButton from '@/components/base/AppButton.vue';
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
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const fieldErrors = ref({});
const modal = ref(null);
const selected = ref(null);
const editor = ref({ title: '', content: '', updatedAt: null });
const textarea = ref(null);
const savedSnapshot = ref('');
let searchTimer;

const isEditing = computed(() => modal.value === 'edit' || modal.value === 'create');
const dirty = computed(
  () => isEditing.value && JSON.stringify(editor.value) !== savedSnapshot.value
);
const modalTitle = computed(() => {
  if (modal.value === 'create') return 'Nova nota';
  if (modal.value === 'edit') return 'Editar nota';
  return selected.value?.title || 'Sem título';
});
const renderedContent = computed(() => renderMarkdown(selected.value?.content ?? ''));

function snapshot() {
  savedSnapshot.value = JSON.stringify(editor.value);
}

function formatDate(value) {
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams({ q: query.value, sort: sort.value });
    if (from.value) params.set('from', from.value);
    if (to.value) params.set('to', to.value);
    notes.value = (await api(`/api/notes?${params}`)).notes;
  } catch (caught) {
    error.value = caught.message;
  } finally {
    loading.value = false;
  }
}

function setView(mode) {
  viewMode.value = mode;
  localStorage.setItem('notes-view-mode', mode);
}

async function open(note) {
  error.value = '';
  fieldErrors.value = {};
  try {
    selected.value = (await api(`/api/notes/${note.id}`)).note;
    modal.value = 'view';
  } catch (caught) {
    error.value = caught.message;
  }
}

function beginCreate() {
  selected.value = null;
  editor.value = { title: '', content: '', updatedAt: null };
  fieldErrors.value = {};
  error.value = '';
  modal.value = 'create';
  snapshot();
  nextTick(() => textarea.value?.focus());
}

function beginEdit() {
  editor.value = {
    title: selected.value.title,
    content: selected.value.content,
    updatedAt: selected.value.updatedAt
  };
  fieldErrors.value = {};
  modal.value = 'edit';
  snapshot();
  nextTick(() => textarea.value?.focus());
}

function closeModal() {
  if (dirty.value && !window.confirm('Descartar alterações não salvas desta nota?')) return;
  modal.value = null;
  selected.value = null;
  fieldErrors.value = {};
}

function insertMarkup(before, after = before, placeholder = 'texto') {
  const input = textarea.value;
  const start = input?.selectionStart ?? editor.value.content.length;
  const end = input?.selectionEnd ?? start;
  const selectedText = editor.value.content.slice(start, end) || placeholder;
  editor.value.content =
    editor.value.content.slice(0, start) +
    before +
    selectedText +
    after +
    editor.value.content.slice(end);
  nextTick(() => {
    input?.focus();
    input?.setSelectionRange(start + before.length, start + before.length + selectedText.length);
  });
}

function prefixLine(prefix) {
  const input = textarea.value;
  const start = input?.selectionStart ?? 0;
  const lineStart = editor.value.content.lastIndexOf('\n', start - 1) + 1;
  editor.value.content =
    editor.value.content.slice(0, lineStart) + prefix + editor.value.content.slice(lineStart);
  nextTick(() => input?.focus());
}

async function save() {
  saving.value = true;
  error.value = '';
  fieldErrors.value = {};
  try {
    const body = {
      ...editor.value,
      title: editor.value.title.trim(),
      content: editor.value.content.trim()
    };
    const headers = { 'X-CSRF-Token': auth.csrfToken };
    const result =
      modal.value === 'create'
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
    error.value =
      caught instanceof ApiError && caught.code === 'NOTE_CONFLICT'
        ? 'Esta nota mudou em outro contexto. Feche e abra novamente antes de salvar.'
        : caught.message;
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!selected.value) return;
  if (!window.confirm(`Excluir “${selected.value.title || 'Sem título'}”? Esta ação não pode ser desfeita.`))
    return;
  saving.value = true;
  error.value = '';
  try {
    await api(`/api/notes/${selected.value.id}`, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': auth.csrfToken }
    });
    modal.value = null;
    selected.value = null;
    notice.value = 'Nota excluída.';
    await load();
  } catch (caught) {
    error.value = caught.message;
  } finally {
    saving.value = false;
  }
}

watch([query, sort, from, to], () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(load, 250);
});
onMounted(load);
onBeforeUnmount(() => window.clearTimeout(searchTimer));
</script>

<template>
  <AppShell>
    <section class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="font-semibold">Registro de notas</h2>
          <p class="mt-1 text-sm text-muted">Registre notas operacionais.</p>
        </div>
        <AppButton @click="beginCreate"><FilePlus2 :size="17" />Nova nota</AppButton>
      </div>

      <div class="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <label class="relative min-w-52 flex-1"><span class="sr-only">Buscar notas</span><Search class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" :size="16" /><input v-model="query" class="w-full rounded-md border border-border bg-canvas py-2 pl-9 pr-3 text-sm" placeholder="Buscar título ou conteúdo" /></label>
        <label><span class="sr-only">Data inicial</span><span class="mb-1 block text-xs text-muted">Atualizada a partir de</span><input v-model="from" class="min-h-10 rounded-md border border-border bg-canvas px-3 text-sm" type="date" /></label>
        <label><span class="sr-only">Data final</span><span class="mb-1 block text-xs text-muted">Atualizada até</span><input v-model="to" class="min-h-10 rounded-md border border-border bg-canvas px-3 text-sm" type="date" /></label>
        <label><span class="sr-only">Ordenar notas</span><span class="mb-1 block text-xs text-muted">Ordenar</span><select v-model="sort" class="min-h-10 rounded-md border border-border bg-canvas px-3 text-sm"><option value="updatedAt:desc">Atualizadas recentemente</option><option value="updatedAt:asc">Atualizadas primeiro</option><option value="createdAt:desc">Criadas recentemente</option><option value="title:asc">Título, A–Z</option><option value="title:desc">Título, Z–A</option></select></label>
        <div class="flex gap-1 rounded-md border border-border bg-canvas p-1" aria-label="Visualização"><AppButton variant="secondary" :aria-pressed="viewMode === 'cards'" title="Blocos" @click="setView('cards')"><Grid2X2 :size="17" /><span class="sr-only">Exibir em blocos</span></AppButton><AppButton variant="secondary" :aria-pressed="viewMode === 'list'" title="Lista" @click="setView('list')"><List :size="17" /><span class="sr-only">Exibir em lista</span></AppButton></div>
      </div>

      <p v-if="error && !modal" class="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">{{ error }}</p>
      <p v-if="notice" class="rounded-md border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-200" role="status">{{ notice }}</p>
      <div v-if="loading" class="rounded-lg border border-border bg-surface p-8 text-sm text-muted">Carregando notas…</div>
      <div v-else-if="notes.length === 0" class="rounded-lg border border-border bg-surface p-10 text-center text-sm text-muted"><FilePlus2 class="mx-auto" :size="28" /><p class="mt-3">{{ query || from || to ? 'Nenhuma nota corresponde aos filtros.' : 'Nenhuma nota criada ainda.' }}</p></div>
      <div v-else :class="viewMode === 'cards' ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'divide-y divide-border rounded-lg border border-border bg-surface'">
        <button v-for="note in notes" :key="note.id" class="group text-left" :class="viewMode === 'cards' ? 'rounded-lg border border-border bg-surface p-4 hover:border-accent hover:bg-elevated' : 'w-full p-4 hover:bg-elevated'" @click="open(note)"><div class="flex items-start justify-between gap-3"><h3 class="line-clamp-2 font-medium">{{ note.title || 'Sem título' }}</h3><Eye class="shrink-0 text-muted group-hover:text-accent" :size="18" /></div><p class="mt-3 line-clamp-3 text-sm text-muted">{{ excerpt(note.content) }}</p><p class="mt-4 text-xs text-muted">Atualizada em {{ formatDate(note.updatedAt) }}</p></button>
      </div>
    </section>

    <div v-if="modal" class="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" @click.self="closeModal" @keydown.esc="closeModal">
      <section class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-border bg-surface shadow-2xl" role="dialog" aria-modal="true" :aria-label="modalTitle">
        <header class="sticky top-0 flex items-center justify-between gap-3 border-b border-border bg-surface p-4"><div><h2 class="font-semibold">{{ modalTitle }}</h2><p v-if="selected && modal === 'view'" class="mt-1 text-xs text-muted">Atualizada em {{ formatDate(selected.updatedAt) }}</p></div><AppButton variant="secondary" title="Fechar" @click="closeModal"><X :size="18" /><span class="sr-only">Fechar</span></AppButton></header>
        <div v-if="modal === 'view'" class="space-y-6 p-5 sm:p-6"><article class="note-markdown" v-html="renderedContent" /><div class="flex flex-wrap justify-between gap-3 border-t border-border pt-4"><AppButton variant="danger" :disabled="saving" @click="remove"><Trash2 :size="16" />Excluir</AppButton><AppButton @click="beginEdit"><Pencil :size="16" />Editar</AppButton></div></div>
        <form v-else class="space-y-4 p-5 sm:p-6" @submit.prevent="save"><label class="block text-sm"><span>Título <span class="text-muted">(opcional)</span></span><input v-model="editor.title" class="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2" :aria-invalid="Boolean(fieldErrors.title)" maxlength="160" placeholder="Ex.: Procedimento de deploy" /><span v-if="fieldErrors.title" class="mt-1 block text-xs text-red-300">{{ fieldErrors.title }}</span></label><div><div class="flex flex-wrap gap-1 rounded-t-md border border-border bg-elevated p-2" aria-label="Formatação rápida"><AppButton variant="secondary" type="button" title="Negrito" @click="insertMarkup('**')"><Bold :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Itálico" @click="insertMarkup('*')"><Italic :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Sublinhado" @click="insertMarkup('++')"><Underline :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Título" @click="prefixLine('## ')"><TextCursorInput :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Lista" @click="prefixLine('- ')"><List :size="16" /></AppButton><AppButton variant="secondary" type="button" title="Texto pequeno" @click="insertMarkup('[size=small]', '[/size]')">A−</AppButton><AppButton variant="secondary" type="button" title="Texto grande" @click="insertMarkup('[size=large]', '[/size]')">A+</AppButton></div><label class="block text-sm"><span class="sr-only">Conteúdo</span><textarea ref="textarea" v-model="editor.content" class="min-h-72 w-full resize-y rounded-b-md border border-t-0 border-border bg-canvas px-3 py-2 leading-6" :aria-invalid="Boolean(fieldErrors.content)" maxlength="100000" required placeholder="Registre o contexto operacional…" /></label><span v-if="fieldErrors.content" class="mt-1 block text-xs text-red-300">{{ fieldErrors.content }}</span></div><p v-if="error" class="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">{{ error }}</p><div class="flex flex-wrap justify-end gap-3"><AppButton variant="secondary" type="button" :disabled="saving" @click="closeModal">Cancelar</AppButton><AppButton type="submit" :loading="saving">Salvar nota</AppButton></div></form>
      </section>
    </div>
  </AppShell>
</template>

<style>
.note-markdown { line-height: 1.7; overflow-wrap: anywhere; }
.note-markdown h3, .note-markdown h4, .note-markdown h5 { font-weight: 600; margin: 1.25rem 0 .5rem; }
.note-markdown p { margin: .75rem 0; }
.note-markdown ul { list-style: disc; margin: .75rem 0; padding-left: 1.5rem; }
.note-size-small { font-size: .875rem; }
.note-size-large { font-size: 1.25rem; }
.note-size-xlarge { font-size: 1.5rem; }
</style>
