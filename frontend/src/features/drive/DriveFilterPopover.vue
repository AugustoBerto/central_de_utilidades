<script setup>
import { X } from 'lucide-vue-next';

import AppButton from '@/components/base/AppButton.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  filters: { type: Object, required: true },
  activeCount: { type: Number, default: 0 }
});
const emit = defineEmits(['close', 'change', 'clear']);

function change(key, value) {
  emit('change', key, value);
}
</script>

<template>
  <div v-if="open" class="absolute right-0 top-full z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-4 shadow-2xl">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h3 class="font-semibold">Filtrar itens</h3>
        <p class="mt-1 text-xs text-muted">Refine o conteúdo sem ocupar a área da tabela.</p>
      </div>
      <button type="button" class="rounded-md p-2 text-muted hover:bg-elevated hover:text-foreground" aria-label="Fechar filtros" @click="emit('close')">
        <X :size="17" aria-hidden="true" />
      </button>
    </div>

    <div class="mt-4 grid gap-3 sm:grid-cols-2">
      <label class="text-xs font-medium text-muted">
        Tipo
        <select :value="filters.type" class="mt-1 min-h-10 w-full rounded-md border border-border bg-canvas px-2 text-sm text-foreground" @change="change('type', $event.target.value)">
          <option value="all">Todos</option>
          <option value="folder">Pastas</option>
          <option value="document">Documentos</option>
          <option value="image">Imagens</option>
          <option value="audio">Áudios</option>
          <option value="video">Vídeos</option>
          <option value="other">Outros</option>
        </select>
      </label>
      <label class="text-xs font-medium text-muted">
        Modificado a partir de
        <input :value="filters.from" type="date" class="mt-1 min-h-10 w-full rounded-md border border-border bg-canvas px-2 text-sm text-foreground" @input="change('from', $event.target.value)" />
      </label>
      <label class="text-xs font-medium text-muted">
        Modificado até
        <input :value="filters.to" type="date" class="mt-1 min-h-10 w-full rounded-md border border-border bg-canvas px-2 text-sm text-foreground" @input="change('to', $event.target.value)" />
      </label>
      <label class="text-xs font-medium text-muted">
        Tamanho mínimo (MB)
        <input :value="filters.minSizeMb" type="number" min="0" step="0.1" class="mt-1 min-h-10 w-full rounded-md border border-border bg-canvas px-2 text-sm text-foreground" @input="change('minSizeMb', $event.target.value)" />
      </label>
      <label class="text-xs font-medium text-muted sm:col-span-2">
        Tamanho máximo (MB)
        <input :value="filters.maxSizeMb" type="number" min="0" step="0.1" class="mt-1 min-h-10 w-full rounded-md border border-border bg-canvas px-2 text-sm text-foreground" @input="change('maxSizeMb', $event.target.value)" />
      </label>
    </div>

    <div class="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
      <span class="text-xs text-muted">{{ activeCount }} filtro(s) ativo(s)</span>
      <AppButton variant="secondary" :disabled="!activeCount" @click="emit('clear')">Limpar filtros</AppButton>
    </div>
  </div>
</template>
