<script setup>
import { FilePlus2, Search, Trash2 } from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

import AppButton from '@/components/base/AppButton.vue';
import AppShell from '@/components/layout/AppShell.vue';
import { ApiError, api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const notes = ref([]);
const query = ref('');
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const selected = ref(null);
const editor = ref({ title: '', content: '', updatedAt: null });
const savedSnapshot = ref('');
let searchTimer;

const dirty = computed(
  () => selected.value !== null && JSON.stringify(editor.value) !== savedSnapshot.value
);
const selectedTitle = computed(() => editor.value.title || 'Sem título');

function snapshot() {
  savedSnapshot.value = JSON.stringify(editor.value);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    notes.value = (await api(`/api/notes?q=${encodeURIComponent(query.value)}`)).notes;
  } catch (caught) {
    error.value = caught.message;
  } finally {
    loading.value = false;
  }
}

function create() {
  selected.value = 'new';
  editor.value = { title: '', content: '', updatedAt: null };
  snapshot();
  error.value = '';
  notice.value = '';
}

function select(note) {
  if (dirty.value && !window.confirm('Descartar alterações não salvas desta nota?'))
    return;
  selected.value = note.id;
  editor.value = {
    title: note.title,
    content: note.content,
    updatedAt: note.updatedAt
  };
  snapshot();
  error.value = '';
}

function closeEditor() {
  if (dirty.value && !window.confirm('Descartar alterações não salvas desta nota?'))
    return;
  selected.value = null;
  error.value = '';
}

async function save() {
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    const headers = { 'X-CSRF-Token': auth.csrfToken };
    const result =
      selected.value === 'new'
        ? await api('/api/notes', { method: 'POST', headers, body: editor.value })
        : await api(`/api/notes/${selected.value}`, {
            method: 'PATCH',
            headers,
            body: editor.value
          });
    selected.value = result.note.id;
    editor.value = {
      title: result.note.title,
      content: result.note.content,
      updatedAt: result.note.updatedAt
    };
    snapshot();
    notice.value = 'Nota salva.';
    await load();
  } catch (caught) {
    error.value =
      caught instanceof ApiError && caught.code === 'NOTE_CONFLICT'
        ? 'Esta nota mudou em outro contexto. Reabra-a antes de salvar para não perder conteúdo.'
        : caught.message;
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (selected.value === 'new') return closeEditor();
  if (
    !window.confirm(
      `Excluir “${selectedTitle.value}”? Esta ação não pode ser desfeita.`
    )
  )
    return;
  saving.value = true;
  error.value = '';
  try {
    await api(`/api/notes/${selected.value}`, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': auth.csrfToken }
    });
    selected.value = null;
    notice.value = 'Nota excluída.';
    await load();
  } catch (caught) {
    error.value = caught.message;
  } finally {
    saving.value = false;
  }
}

watch(query, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(load, 250);
});
onMounted(load);
onBeforeUnmount(() => window.clearTimeout(searchTimer));
onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return window.confirm('Você tem alterações não salvas. Sair mesmo assim?');
});
</script>

<template>
  <AppShell>
    <section class="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside class="rounded-lg border border-border bg-surface">
        <div class="border-b border-border p-4">
          <AppButton class="w-full" @click="create"
            ><FilePlus2 :size="17" aria-hidden="true" />Nova nota</AppButton
          >
          <label class="relative mt-3 block"
            ><span class="sr-only">Buscar notas</span
            ><Search
              class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              :size="16" /><input
              v-model="query"
              class="w-full rounded-md border border-border bg-canvas py-2 pl-9 pr-3 text-sm"
              placeholder="Buscar notas"
          /></label>
        </div>
        <p v-if="loading" class="p-4 text-sm text-muted">Carregando notas…</p>
        <p v-else-if="notes.length === 0" class="p-4 text-sm text-muted">
          {{ query ? 'Nenhum resultado para a busca.' : 'Nenhuma nota criada ainda.' }}
        </p>
        <ul v-else class="divide-y divide-border">
          <li v-for="note in notes" :key="note.id">
            <button
              class="w-full px-4 py-3 text-left hover:bg-elevated"
              :class="{ 'bg-elevated': selected === note.id }"
              @click="select(note)"
            >
              <p class="truncate text-sm font-medium">
                {{ note.title || 'Sem título' }}
              </p>
              <p class="mt-1 line-clamp-2 text-xs text-muted">{{ note.content }}</p>
              <p class="mt-2 text-xs text-muted">
                {{ new Date(note.updatedAt).toLocaleString('pt-BR') }}
              </p>
            </button>
          </li>
        </ul>
      </aside>

      <div class="rounded-lg border border-border bg-surface p-5 sm:p-6">
        <div
          v-if="!selected"
          class="grid min-h-72 place-items-center text-center text-muted"
        >
          <div>
            <FilePlus2 class="mx-auto" :size="28" aria-hidden="true" />
            <p class="mt-3">Selecione uma nota ou crie um novo registro.</p>
          </div>
        </div>
        <form v-else class="space-y-4" @submit.prevent="save">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-muted">
              {{ dirty ? 'Alterações não salvas' : 'Todas as alterações foram salvas' }}
            </p>
            <button
              type="button"
              class="text-sm text-muted hover:text-foreground"
              @click="closeEditor"
            >
              Fechar
            </button>
          </div>
          <label class="block text-sm"
            ><span>Título <span class="text-muted">(opcional)</span></span
            ><input
              v-model="editor.title"
              class="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2"
              maxlength="160"
              placeholder="Ex.: Procedimento de deploy"
          /></label>
          <label class="block text-sm"
            ><span>Conteúdo</span
            ><textarea
              v-model="editor.content"
              class="mt-1 min-h-72 w-full resize-y rounded-md border border-border bg-canvas px-3 py-2 leading-6"
              maxlength="100000"
              required
              placeholder="Registre o contexto operacional…"
            />
          </label>
          <p
            v-if="error"
            class="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200"
            role="alert"
          >
            {{ error }}
          </p>
          <p
            v-if="notice"
            class="rounded-md border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-200"
            role="status"
          >
            {{ notice }}
          </p>
          <div class="flex flex-wrap justify-between gap-3">
            <AppButton
              v-if="selected !== 'new'"
              variant="danger"
              type="button"
              :disabled="saving"
              @click="remove"
              ><Trash2 :size="16" aria-hidden="true" />Excluir</AppButton
            ><span v-else /><AppButton type="submit" :loading="saving"
              >Salvar nota</AppButton
            >
          </div>
        </form>
      </div>
    </section>
  </AppShell>
</template>
