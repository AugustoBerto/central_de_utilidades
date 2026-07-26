<script setup>
import { AlertTriangle, HardDrive, Settings } from 'lucide-vue-next';
import { computed } from 'vue';

import { formatBytes } from '@/features/dashboard/format';

const props = defineProps({
  status: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  itemCount: { type: Number, default: 0 },
  selectedCount: { type: Number, default: 0 }
});

const percentage = computed(() =>
  Math.min(100, Math.max(0, props.status?.usedPercent ?? 0))
);
const physicalLimit = computed(() =>
  Boolean(
    props.status &&
      props.status.physicalFreeBytes !== null &&
      props.status.physicalFreeBytes < props.status.quotaFreeBytes
  )
);
</script>

<template>
  <div
    class="sticky bottom-0 z-20 flex min-h-10 items-center justify-between gap-4 border-t border-border bg-surface/95 px-3 py-2 text-xs text-muted backdrop-blur"
    aria-live="polite"
  >
    <span class="whitespace-nowrap">
      {{ itemCount }} {{ itemCount === 1 ? 'item' : 'itens' }}
      <template v-if="selectedCount"> · {{ selectedCount }} selecionado(s)</template>
    </span>

    <details class="group relative ml-auto">
      <summary
        class="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1 hover:bg-elevated hover:text-foreground"
      >
        <HardDrive :size="15" aria-hidden="true" />
        <span v-if="status" class="hidden sm:inline">
          {{ formatBytes(status.usedBytes) }} / {{ formatBytes(status.reservedBytes) }}
        </span>
        <span v-if="status" class="font-medium text-foreground">
          {{ formatBytes(status.effectiveFreeBytes) }} livres
        </span>
        <span v-else>{{ loading ? 'Calculando…' : 'Indisponível' }}</span>
        <AlertTriangle
          v-if="physicalLimit"
          class="text-amber-500"
          :size="15"
          aria-label="O disco físico limita o espaço disponível"
        />
      </summary>

      <div
        v-if="status"
        class="absolute bottom-full right-0 mb-2 w-72 rounded-lg border border-border bg-surface p-4 text-sm shadow-2xl"
      >
        <div class="flex items-center justify-between gap-3">
          <h3 class="font-semibold text-foreground">Armazenamento do Drive</h3>
          <span class="tabular-nums">{{ Math.round(percentage) }}%</span>
        </div>
        <div
          class="mt-3 h-1.5 overflow-hidden rounded-full bg-elevated"
          role="progressbar"
          aria-label="Uso do armazenamento do Drive"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Math.round(percentage)"
        >
          <div class="h-full rounded-full bg-accent" :style="{ width: `${percentage}%` }" />
        </div>
        <dl class="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-xs">
          <dt>Utilizado</dt><dd class="text-foreground">{{ formatBytes(status.usedBytes) }}</dd>
          <dt>Espaço reservado</dt><dd class="text-foreground">{{ formatBytes(status.reservedBytes) }}</dd>
          <dt>Disponível ao Drive</dt><dd class="text-foreground">{{ formatBytes(status.effectiveFreeBytes) }}</dd>
          <dt>Máximo por arquivo</dt><dd class="text-foreground">{{ formatBytes(status.maxUploadBytes) }}</dd>
          <dt v-if="status.physicalFreeBytes !== null">Livre no disco</dt>
          <dd v-if="status.physicalFreeBytes !== null" class="text-foreground">
            {{ formatBytes(status.physicalFreeBytes) }}
          </dd>
        </dl>
        <p v-if="physicalLimit" class="mt-3 flex gap-2 text-xs text-amber-500">
          <AlertTriangle class="shrink-0" :size="14" aria-hidden="true" />
          O espaço físico da máquina é menor que o restante da cota.
        </p>
        <RouterLink
          to="/settings"
          class="mt-4 inline-flex items-center gap-2 text-xs font-medium text-accent hover:underline"
        >
          <Settings :size="14" aria-hidden="true" />Configurar armazenamento
        </RouterLink>
      </div>
    </details>
  </div>
</template>
