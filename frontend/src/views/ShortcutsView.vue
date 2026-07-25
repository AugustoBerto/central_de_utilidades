<script setup>
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Folder,
  Globe,
  Link,
  Pencil,
  Plus,
  Server,
  Shield,
  Terminal,
  Trash2,
  Zap
} from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';

import AppButton from '@/components/base/AppButton.vue';
import AppModal from '@/components/base/AppModal.vue';
import AppShell from '@/components/layout/AppShell.vue';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';

const icons = { 'book-open': BookOpen, folder: Folder, globe: Globe, link: Link, server: Server, shield: Shield, terminal: Terminal, zap: Zap };
const auth = useAuthStore();
const shortcuts = ref([]);
const loading = ref(true);
const error = ref('');
const fieldErrors = ref({});
const notice = ref('');
const editingId = ref(null);
const saving = ref(false);
const movingId = ref(null);
const modalOpen = ref(false);
const savedSnapshot = ref('');
const form = ref({ label: '', url: '', groupName: '', iconKey: 'link', isPinned: false });
const groups = computed(() => {
  const result = new Map();
  for (const shortcut of shortcuts.value) {
    const group = shortcut.groupName || 'Sem grupo';
    result.set(group, [...(result.get(group) ?? []), shortcut]);
  }
  return [...result.entries()];
});
const dirty = computed(() => modalOpen.value && JSON.stringify(form.value) !== savedSnapshot.value);
const modalTitle = computed(() => editingId.value ? 'Editar atalho' : 'Novo atalho');

async function load() {
  loading.value = true; error.value = '';
  try { shortcuts.value = (await api('/api/shortcuts')).shortcuts; }
  catch (caught) { error.value = caught.message; }
  finally { loading.value = false; }
}
function snapshot() { savedSnapshot.value = JSON.stringify(form.value); }
function openCreate() {
  editingId.value = null;
  form.value = { label: '', url: '', groupName: '', iconKey: 'link', isPinned: false };
  fieldErrors.value = {}; error.value = ''; notice.value = ''; modalOpen.value = true; snapshot();
}
function edit(shortcut) {
  editingId.value = shortcut.id;
  form.value = { label: shortcut.label, url: shortcut.url, groupName: shortcut.groupName, iconKey: shortcut.iconKey, isPinned: shortcut.isPinned };
  notice.value = ''; error.value = ''; fieldErrors.value = {}; modalOpen.value = true; snapshot();
}
function closeModal() {
  if (dirty.value && !window.confirm('Descartar alterações não salvas deste atalho?')) return;
  modalOpen.value = false; editingId.value = null; fieldErrors.value = {};
}
async function save() {
  saving.value = true; error.value = ''; fieldErrors.value = {};
  try {
    const options = { headers: { 'X-CSRF-Token': auth.csrfToken }, body: { ...form.value, label: form.value.label.trim(), url: form.value.url.trim(), groupName: form.value.groupName.trim() } };
    const wasEditing = Boolean(editingId.value);
    if (wasEditing) await api(`/api/shortcuts/${editingId.value}`, { ...options, method: 'PATCH' });
    else await api('/api/shortcuts', { ...options, method: 'POST' });
    notice.value = wasEditing ? 'Atalho atualizado.' : 'Atalho criado.';
    snapshot(); modalOpen.value = false; editingId.value = null;
    await load(); window.dispatchEvent(new Event('shortcuts:changed'));
  } catch (caught) { error.value = caught.message; fieldErrors.value = caught.fields ?? {}; }
  finally { saving.value = false; }
}
async function move(shortcut, direction) {
  const siblings = shortcuts.value.filter((item) => item.groupName === shortcut.groupName);
  const index = siblings.findIndex((item) => item.id === shortcut.id);
  const target = index + direction;
  if (target < 0 || target >= siblings.length) return;
  movingId.value = shortcut.id;
  try {
    await api(`/api/shortcuts/${shortcut.id}`, { method: 'PATCH', headers: { 'X-CSRF-Token': auth.csrfToken }, body: { position: target } });
    await load(); window.dispatchEvent(new Event('shortcuts:changed'));
  } catch (caught) { error.value = caught.message; }
  finally { movingId.value = null; }
}
async function remove(shortcut) {
  if (!window.confirm(`Excluir “${shortcut.label}”?`)) return;
  try {
    await api(`/api/shortcuts/${shortcut.id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': auth.csrfToken } });
    notice.value = 'Atalho excluído.'; await load(); window.dispatchEvent(new Event('shortcuts:changed'));
  } catch (caught) { error.value = caught.message; }
}

onMounted(load);
</script>

<template>
  <AppShell>
    <section class="min-w-0 space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div><h2 class="font-semibold">Acessos frequentes</h2><p class="mt-1 text-sm text-muted">Abra e organize sistemas externos com segurança.</p></div>
        <AppButton @click="openCreate"><Plus :size="17" aria-hidden="true" />Novo atalho</AppButton>
      </div>

      <p v-if="error && !modalOpen" class="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">{{ error }}</p>
      <p v-if="notice" class="rounded-md border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-200" role="status">{{ notice }}</p>
      <div v-if="loading" class="rounded-lg border border-border bg-surface p-5 text-sm text-muted">Carregando atalhos…</div>
      <div v-else-if="shortcuts.length === 0" class="rounded-lg border border-border bg-surface p-10 text-center text-sm text-muted">
        <Link class="mx-auto" :size="28" aria-hidden="true" />
        <p class="mt-3">Nenhum atalho criado ainda.</p>
        <AppButton class="mt-4" @click="openCreate"><Plus :size="17" />Criar primeiro atalho</AppButton>
      </div>
      <template v-else>
        <section v-for="[group, items] in groups" :key="group" class="space-y-3">
          <div class="flex items-center gap-3"><h3 class="text-sm font-medium text-muted">{{ group }}</h3><span class="h-px flex-1 bg-border" /></div>
          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <article v-for="(shortcut, index) in items" :key="shortcut.id" class="flex min-w-0 flex-col rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent/60">
              <div class="flex gap-3">
                <span class="rounded-md border border-border bg-elevated p-2 text-accent"><component :is="icons[shortcut.iconKey]" :size="20" aria-hidden="true" /></span>
                <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><h4 class="break-words font-medium">{{ shortcut.label }}</h4><span v-if="shortcut.isPinned" class="rounded bg-accent/15 px-1.5 py-0.5 text-xs text-accent">Fixado</span></div><p class="mt-1 truncate text-xs text-muted" :title="shortcut.url">{{ shortcut.url }}</p></div>
              </div>
              <div class="mt-auto flex flex-wrap items-center gap-2 pt-5">
                <a :href="shortcut.url" target="_blank" rel="noopener noreferrer" class="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-accent bg-accent px-3 text-sm font-medium text-white hover:bg-blue-500">Abrir <ExternalLink :size="15" aria-hidden="true" /></a>
                <AppButton variant="secondary" title="Editar" @click.stop="edit(shortcut)"><Pencil :size="15" aria-hidden="true" /><span class="sr-only">Editar {{ shortcut.label }}</span></AppButton>
                <AppButton variant="secondary" title="Mover para cima" :disabled="index === 0 || movingId !== null" @click.stop="move(shortcut, -1)"><ChevronUp :size="15" /><span class="sr-only">Mover {{ shortcut.label }} para cima</span></AppButton>
                <AppButton variant="secondary" title="Mover para baixo" :disabled="index === items.length - 1 || movingId !== null" @click.stop="move(shortcut, 1)"><ChevronDown :size="15" /><span class="sr-only">Mover {{ shortcut.label }} para baixo</span></AppButton>
                <AppButton variant="danger" title="Excluir" @click.stop="remove(shortcut)"><Trash2 :size="15" /><span class="sr-only">Excluir {{ shortcut.label }}</span></AppButton>
              </div>
            </article>
          </div>
        </section>
      </template>
    </section>

    <AppModal v-if="modalOpen" :title="modalTitle" max-width-class="max-w-xl" @close="closeModal">
      <form class="space-y-4 p-5 sm:p-6" @submit.prevent="save">
        <label class="block text-sm"><span>Rótulo</span><input v-model="form.label" class="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2" :aria-invalid="Boolean(fieldErrors.label)" maxlength="80" required><span v-if="fieldErrors.label" class="mt-1 block text-xs text-red-300">{{ fieldErrors.label }}</span></label>
        <label class="block text-sm"><span>URL HTTPS</span><input v-model="form.url" class="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2" type="url" :aria-invalid="Boolean(fieldErrors.url)" placeholder="https://" required><span v-if="fieldErrors.url" class="mt-1 block text-xs text-red-300">{{ fieldErrors.url }}</span></label>
        <label class="block text-sm"><span>Grupo <span class="text-muted">(opcional)</span></span><input v-model="form.groupName" class="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2" :aria-invalid="Boolean(fieldErrors.groupName)" maxlength="80"><span v-if="fieldErrors.groupName" class="mt-1 block text-xs text-red-300">{{ fieldErrors.groupName }}</span></label>
        <label class="block text-sm"><span>Ícone</span><select v-model="form.iconKey" class="mt-1 min-h-10 w-full rounded-md border border-border bg-canvas px-3"><option v-for="(_, key) in icons" :key="key" :value="key">{{ key }}</option></select><span v-if="fieldErrors.iconKey" class="mt-1 block text-xs text-red-300">{{ fieldErrors.iconKey }}</span></label>
        <label class="flex items-center gap-2 text-sm"><input v-model="form.isPinned" type="checkbox">Fixar para acesso rápido</label>
        <p v-if="error" class="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">{{ error }}</p>
        <div class="flex justify-end gap-3"><AppButton variant="secondary" type="button" :disabled="saving" @click="closeModal">Cancelar</AppButton><AppButton type="submit" :loading="saving">{{ editingId ? 'Salvar alterações' : 'Criar atalho' }}</AppButton></div>
      </form>
    </AppModal>
  </AppShell>
</template>
