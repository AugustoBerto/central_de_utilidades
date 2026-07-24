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
import AppShell from '@/components/layout/AppShell.vue';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';

const icons = {
  'book-open': BookOpen,
  folder: Folder,
  globe: Globe,
  link: Link,
  server: Server,
  shield: Shield,
  terminal: Terminal,
  zap: Zap
};
const auth = useAuthStore();
const shortcuts = ref([]);
const loading = ref(true);
const error = ref('');
const fieldErrors = ref({});
const notice = ref('');
const editingId = ref(null);
const saving = ref(false);
const form = ref({
  label: '',
  url: '',
  groupName: '',
  iconKey: 'link',
  isPinned: false
});
const groups = computed(() => {
  const result = new Map();
  for (const shortcut of shortcuts.value) {
    const group = shortcut.groupName || 'Sem grupo';
    result.set(group, [...(result.get(group) ?? []), shortcut]);
  }
  return [...result.entries()];
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    shortcuts.value = (await api('/api/shortcuts')).shortcuts;
  } catch (caught) {
    error.value = caught.message;
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  editingId.value = null;
  form.value = { label: '', url: '', groupName: '', iconKey: 'link', isPinned: false };
  fieldErrors.value = {};
}

function edit(shortcut) {
  editingId.value = shortcut.id;
  form.value = {
    label: shortcut.label,
    url: shortcut.url,
    groupName: shortcut.groupName,
    iconKey: shortcut.iconKey,
    isPinned: shortcut.isPinned
  };
  notice.value = '';
  error.value = '';
  fieldErrors.value = {};
}

async function save() {
  saving.value = true;
  error.value = '';
  fieldErrors.value = {};
  try {
    const options = {
      headers: { 'X-CSRF-Token': auth.csrfToken },
      body: {
        ...form.value,
        label: form.value.label.trim(),
        url: form.value.url.trim(),
        groupName: form.value.groupName.trim()
      }
    };
    if (editingId.value)
      await api(`/api/shortcuts/${editingId.value}`, { ...options, method: 'PATCH' });
    else await api('/api/shortcuts', { ...options, method: 'POST' });
    notice.value = editingId.value ? 'Atalho atualizado.' : 'Atalho criado.';
    resetForm();
    await load();
    window.dispatchEvent(new Event('shortcuts:changed'));
  } catch (caught) {
    error.value = caught.message;
    fieldErrors.value = caught.fields ?? {};
  } finally {
    saving.value = false;
  }
}

async function move(shortcut, direction) {
  const siblings = shortcuts.value.filter(
    (item) => item.groupName === shortcut.groupName
  );
  const index = siblings.findIndex((item) => item.id === shortcut.id);
  const target = index + direction;
  if (target < 0 || target >= siblings.length) return;
  try {
    await api(`/api/shortcuts/${shortcut.id}`, {
      method: 'PATCH',
      headers: { 'X-CSRF-Token': auth.csrfToken },
      body: { position: target }
    });
    await load();
    window.dispatchEvent(new Event('shortcuts:changed'));
  } catch (caught) {
    error.value = caught.message;
  }
}

async function remove(shortcut) {
  if (!window.confirm(`Excluir “${shortcut.label}”?`)) return;
  try {
    await api(`/api/shortcuts/${shortcut.id}`, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': auth.csrfToken }
    });
    notice.value = 'Atalho excluído.';
    if (editingId.value === shortcut.id) resetForm();
    await load();
    window.dispatchEvent(new Event('shortcuts:changed'));
  } catch (caught) {
    error.value = caught.message;
  }
}

onMounted(load);
</script>

<template>
  <AppShell>
    <section class="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div class="min-w-0 space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="font-semibold">Acessos frequentes</h2>
            <p class="mt-1 text-sm text-muted">Abra sistemas externos com segurança.</p>
          </div>
          <AppButton @click="resetForm"
            ><Plus :size="17" aria-hidden="true" />Novo atalho</AppButton
          >
        </div>
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
        <div
          v-if="loading"
          class="rounded-lg border border-border bg-surface p-5 text-sm text-muted"
        >
          Carregando atalhos…
        </div>
        <div
          v-else-if="shortcuts.length === 0"
          class="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted"
        >
          <Link class="mx-auto" :size="26" aria-hidden="true" />Nenhum atalho criado
          ainda.
        </div>
        <template v-else>
          <section v-for="[group, items] in groups" :key="group" class="space-y-3">
            <h3 class="text-sm font-medium text-muted">{{ group }}</h3>
            <div class="grid gap-3 sm:grid-cols-2">
              <article
                v-for="(shortcut, index) in items"
                :key="shortcut.id"
                class="rounded-lg border border-border bg-surface p-4"
              >
                <div class="flex gap-3">
                  <component
                    :is="icons[shortcut.iconKey]"
                    class="mt-0.5 text-accent"
                    :size="20"
                    aria-hidden="true"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <h4 class="break-words font-medium">{{ shortcut.label }}</h4>
                      <span
                        v-if="shortcut.isPinned"
                        class="rounded bg-accent/15 px-1.5 py-0.5 text-xs text-accent"
                        >Fixado</span
                      >
                    </div>
                    <p class="mt-1 break-all text-xs text-muted">{{ shortcut.url }}</p>
                  </div>
                </div>
                <div class="mt-4 flex flex-wrap items-center gap-2">
                  <a
                    :href="shortcut.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex min-h-10 items-center gap-2 rounded-md border border-accent bg-accent px-3 text-sm font-medium text-white hover:bg-blue-500"
                    >Abrir <ExternalLink :size="15" aria-hidden="true" /></a
                  ><AppButton variant="secondary" @click="edit(shortcut)"
                    ><Pencil :size="15" aria-hidden="true" /><span class="sr-only"
                      >Editar {{ shortcut.label }}</span
                    ></AppButton
                  ><AppButton
                    variant="secondary"
                    :disabled="index === 0"
                    @click="move(shortcut, -1)"
                    ><ChevronUp :size="15" aria-hidden="true" /><span class="sr-only"
                      >Mover {{ shortcut.label }} para cima</span
                    ></AppButton
                  ><AppButton
                    variant="secondary"
                    :disabled="index === items.length - 1"
                    @click="move(shortcut, 1)"
                    ><ChevronDown :size="15" aria-hidden="true" /><span class="sr-only"
                      >Mover {{ shortcut.label }} para baixo</span
                    ></AppButton
                  ><AppButton variant="danger" @click="remove(shortcut)"
                    ><Trash2 :size="15" aria-hidden="true" /><span class="sr-only"
                      >Excluir {{ shortcut.label }}</span
                    ></AppButton
                  >
                </div>
              </article>
            </div>
          </section>
        </template>
      </div>
      <aside class="order-first h-fit min-w-0 w-full rounded-lg border border-border bg-surface p-5 xl:order-none">
        <h2 class="font-semibold">{{ editingId ? 'Editar atalho' : 'Novo atalho' }}</h2>
        <form class="mt-5 space-y-4" @submit.prevent="save">
          <label class="block text-sm"
            ><span>Rótulo</span
            ><input
              v-model="form.label"
              class="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2"
              :aria-invalid="Boolean(fieldErrors.label)"
              :aria-describedby="fieldErrors.label ? 'shortcut-label-error' : undefined"
              maxlength="80"
              required /><span
              v-if="fieldErrors.label"
              id="shortcut-label-error"
              class="mt-1 block text-xs text-red-300"
              >{{ fieldErrors.label }}</span
            ></label
          ><label class="block text-sm"
            ><span>URL HTTPS</span
            ><input
              v-model="form.url"
              class="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2"
              type="url"
              :aria-invalid="Boolean(fieldErrors.url)"
              :aria-describedby="fieldErrors.url ? 'shortcut-url-error' : undefined"
              placeholder="https://"
              required /><span
              v-if="fieldErrors.url"
              id="shortcut-url-error"
              class="mt-1 block text-xs text-red-300"
              >{{ fieldErrors.url }}</span
            ></label
          ><label class="block text-sm"
            ><span>Grupo <span class="text-muted">(opcional)</span></span
            ><input
              v-model="form.groupName"
              class="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2"
              :aria-invalid="Boolean(fieldErrors.groupName)"
              :aria-describedby="fieldErrors.groupName ? 'shortcut-group-error' : undefined"
              maxlength="80" /><span
              v-if="fieldErrors.groupName"
              id="shortcut-group-error"
              class="mt-1 block text-xs text-red-300"
              >{{ fieldErrors.groupName }}</span
            ></label
          ><label class="block text-sm"
            ><span>Ícone</span
            ><select
              v-model="form.iconKey"
              class="mt-1 min-h-10 w-full rounded-md border border-border bg-canvas px-3"
              :aria-invalid="Boolean(fieldErrors.iconKey)"
              :aria-describedby="fieldErrors.iconKey ? 'shortcut-icon-error' : undefined"
            >
              <option v-for="(_, key) in icons" :key="key" :value="key">
                {{ key }}
              </option>
            </select><span
              v-if="fieldErrors.iconKey"
              id="shortcut-icon-error"
              class="mt-1 block text-xs text-red-300"
              >{{ fieldErrors.iconKey }}</span
            ></label
          ><label class="flex items-center gap-2 text-sm"
            ><input v-model="form.isPinned" type="checkbox" />Fixar para acesso
            rápido</label
          >
          <div class="flex gap-2">
            <AppButton type="submit" :loading="saving">Salvar</AppButton
            ><AppButton
              v-if="editingId"
              variant="secondary"
              type="button"
              @click="resetForm"
              >Cancelar</AppButton
            >
          </div>
        </form>
      </aside>
    </section>
  </AppShell>
</template>
