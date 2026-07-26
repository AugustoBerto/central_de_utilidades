<script setup>
import { BookOpen, Folder, Globe, Link as LinkIcon, Server, Shield, Terminal, Zap } from 'lucide-vue-next';
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';

const SLOT_COUNT = 5;
const auth = useAuthStore();
const slots = ref(Array(SLOT_COUNT).fill(null));
const draggingSlot = ref(null);
const dropTarget = ref(null);
const saving = ref(false);
const error = ref('');
let suppressClickUntil = 0;
let errorTimer;

const icons = {
  'book-open': BookOpen,
  folder: Folder,
  globe: Globe,
  link: LinkIcon,
  server: Server,
  shield: Shield,
  terminal: Terminal,
  zap: Zap
};

function emptySlots() {
  return Array(SLOT_COUNT).fill(null);
}

async function load() {
  if (!auth.authenticated) return;
  try {
    const response = await api('/api/shortcuts/pinned');
    const next = emptySlots();
    for (const shortcut of response.shortcuts ?? []) {
      if (Number.isInteger(shortcut.pinnedSlot) && shortcut.pinnedSlot >= 0 && shortcut.pinnedSlot < SLOT_COUNT)
        next[shortcut.pinnedSlot] = shortcut;
    }
    slots.value = next;
    error.value = '';
  } catch {
    slots.value = emptySlots();
  }
}

function showError(message) {
  error.value = message;
  window.clearTimeout(errorTimer);
  errorTimer = window.setTimeout(() => { error.value = ''; }, 3500);
}

async function persist(next, previous) {
  slots.value = next;
  saving.value = true;
  error.value = '';
  try {
    await api('/api/shortcuts/pinned-layout', {
      method: 'PATCH',
      headers: { 'X-CSRF-Token': auth.csrfToken },
      body: { slots: next.map((shortcut) => shortcut?.id ?? null) }
    });
    window.dispatchEvent(new Event('shortcuts:layout-changed'));
  } catch (caught) {
    slots.value = previous;
    showError(caught.message || 'Não foi possível salvar a posição dos atalhos.');
  } finally {
    saving.value = false;
  }
}

function moveSlot(source, target) {
  if (saving.value || source === target || source === null || target === null) return;
  const previous = [...slots.value];
  const next = [...slots.value];
  [next[source], next[target]] = [next[target], next[source]];
  persist(next, previous);
}

function startDrag(event, slot) {
  if (saving.value || !slots.value[slot]) return;
  draggingSlot.value = slot;
  dropTarget.value = slot;
  suppressClickUntil = Date.now() + 400;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(slots.value[slot].id));
}

function overSlot(event, slot) {
  if (draggingSlot.value === null) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  dropTarget.value = slot;
}

function dropOnSlot(event, slot) {
  event.preventDefault();
  const source = draggingSlot.value;
  draggingSlot.value = null;
  dropTarget.value = null;
  suppressClickUntil = Date.now() + 250;
  moveSlot(source, slot);
}

function endDrag() {
  draggingSlot.value = null;
  dropTarget.value = null;
  suppressClickUntil = Date.now() + 200;
}

function openShortcut(event, shortcut) {
  if (Date.now() < suppressClickUntil) {
    event.preventDefault();
    return;
  }
  window.open(shortcut.url, '_blank', 'noopener,noreferrer');
}

function onShortcutKeydown(event, slot) {
  if (!event.altKey) return;
  if (event.key === 'ArrowLeft' && slot > 0) {
    event.preventDefault();
    moveSlot(slot, slot - 1);
  }
  if (event.key === 'ArrowRight' && slot < SLOT_COUNT - 1) {
    event.preventDefault();
    moveSlot(slot, slot + 1);
  }
}

onMounted(() => {
  load();
  window.addEventListener('shortcuts:changed', load);
});

onBeforeUnmount(() => {
  window.clearTimeout(errorTimer);
  window.removeEventListener('shortcuts:changed', load);
});
</script>

<template>
  <nav class="relative hidden shrink-0 md:block" aria-label="Atalhos fixados">
    <div class="grid grid-cols-5 gap-1" :aria-busy="saving">
      <div
        v-for="(shortcut, slot) in slots"
        :key="slot"
        class="flex h-11 w-11 items-center justify-center rounded-md border transition-all xl:w-28"
        :class="[
          draggingSlot !== null
            ? 'border-dashed border-border bg-elevated/50 opacity-100'
            : shortcut
              ? 'border-transparent opacity-100'
              : 'pointer-events-none border-transparent opacity-0',
          dropTarget === slot && draggingSlot !== slot ? 'border-accent bg-accent/10' : '',
          draggingSlot === slot ? 'opacity-45' : ''
        ]"
        @dragover="overSlot($event, slot)"
        @drop="dropOnSlot($event, slot)"
      >
        <button
          v-if="shortcut"
          type="button"
          draggable="true"
          class="flex h-full w-full cursor-grab items-center justify-center gap-2 overflow-hidden rounded-md px-2 text-sm text-muted hover:bg-elevated hover:text-foreground active:cursor-grabbing"
          :title="`${shortcut.label} · Arraste para reorganizar ou use Alt + setas`"
          @click="openShortcut($event, shortcut)"
          @keydown="onShortcutKeydown($event, slot)"
          @dragstart="startDrag($event, slot)"
          @dragend="endDrag"
        >
          <component :is="icons[shortcut.iconKey] || LinkIcon" :size="17" class="shrink-0" aria-hidden="true" />
          <span class="hidden min-w-0 truncate xl:block">{{ shortcut.label }}</span>
        </button>
        <span v-else-if="draggingSlot !== null" class="text-xs text-muted/70" aria-hidden="true">{{ slot + 1 }}</span>
      </div>
    </div>
    <p
      v-if="error"
      class="absolute right-0 top-full z-40 mt-2 w-72 rounded-md border border-red-500/40 bg-surface p-3 text-xs text-red-500 shadow-lg"
      role="alert"
    >
      {{ error }}
    </p>
  </nav>
</template>
