<script setup>
import {
  Activity,
  HardDrive,
  MemoryStick,
  Network,
  RefreshCcw,
  Server,
  Timer
} from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';

import AppButton from '@/components/base/AppButton.vue';
import AppShell from '@/components/layout/AppShell.vue';
import { formatBytes, formatPercent, formatUptime } from '@/features/dashboard/format';
import { api } from '@/services/api';

const POLL_INTERVAL_MS = 15_000;
const metrics = ref(null);
const history = ref([]);
const loading = ref(true);
const refreshing = ref(false);
const error = ref('');
const stale = ref(false);
const LineChart = shallowRef(null);
let timer;

const statusLabel = computed(() => {
  const labels = {
    available: 'Disponível',
    degraded: 'Degradado',
    disabled: 'Origem desabilitada'
  };
  return labels[metrics.value?.status] ?? 'Indisponível';
});
const statusClass = computed(() => {
  const classes = {
    available: 'bg-green-400',
    degraded: 'bg-amber-400',
    disabled: 'bg-muted'
  };
  return classes[metrics.value?.status] ?? 'bg-red-400';
});
const sourceLabel = computed(() => {
  const labels = {
    host: 'host local',
    container: 'container',
    disabled: 'desabilitada'
  };
  return labels[metrics.value?.source?.type] ?? 'indisponível';
});
const chartData = computed(() => ({
  labels: history.value.map((sample) =>
    new Date(sample.collectedAt).toLocaleTimeString('pt-BR', {
      minute: '2-digit',
      second: '2-digit'
    })
  ),
  datasets: [
    {
      label: 'CPU (%)',
      data: history.value.map((sample) => sample.metrics?.cpu?.usagePercent),
      borderColor: '#58a6ff',
      backgroundColor: 'rgba(88, 166, 255, 0.15)',
      tension: 0.3,
      fill: true,
      spanGaps: true
    },
    {
      label: 'Memória (%)',
      data: history.value.map((sample) => sample.metrics?.memory?.usedPercent),
      borderColor: '#3fb950',
      backgroundColor: 'rgba(63, 185, 80, 0.1)',
      tension: 0.3,
      fill: true,
      spanGaps: true
    }
  ]
}));
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: { legend: { labels: { color: '#8b949e' } } },
  scales: {
    x: { ticks: { color: '#8b949e', maxTicksLimit: 6 }, grid: { color: '#21262d' } },
    y: {
      min: 0,
      max: 100,
      ticks: { color: '#8b949e', callback: (value) => `${value}%` },
      grid: { color: '#21262d' }
    }
  }
};

async function loadChart() {
  if (LineChart.value) return;
  const [{ Line }, chart] = await Promise.all([
    import('vue-chartjs'),
    import('chart.js/auto')
  ]);
  void chart;
  LineChart.value = Line;
}

async function refresh() {
  if (refreshing.value) return;
  refreshing.value = true;
  error.value = '';
  try {
    const next = await api('/api/system/metrics');
    metrics.value = next;
    stale.value = false;
    if (next.metrics) {
      history.value = [...history.value, next].slice(-30);
      await loadChart();
    }
  } catch (caught) {
    stale.value = Boolean(metrics.value);
    error.value = caught.message;
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

function schedule() {
  window.clearInterval(timer);
  if (!document.hidden) timer = window.setInterval(refresh, POLL_INTERVAL_MS);
}

function onVisibilityChange() {
  schedule();
  if (!document.hidden) refresh();
}

onMounted(() => {
  refresh();
  schedule();
  document.addEventListener('visibilitychange', onVisibilityChange);
});
onBeforeUnmount(() => {
  window.clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisibilityChange);
});
</script>

<template>
  <AppShell>
    <section class="space-y-6">
      <div
        class="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border bg-surface p-5"
      >
        <div class="flex gap-3">
          <Server class="mt-0.5 text-accent" :size="22" aria-hidden="true" />
          <div>
            <h2 class="font-semibold">Saúde do sistema</h2>
            <p class="mt-1 text-sm text-muted">Origem: {{ sourceLabel }}.</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span class="inline-flex items-center gap-2 text-sm"
            ><span class="size-2 rounded-full" :class="statusClass" />{{
              statusLabel
            }}</span
          >
          <AppButton variant="secondary" :loading="refreshing" @click="refresh"
            ><RefreshCcw :size="16" aria-hidden="true" />Atualizar</AppButton
          >
        </div>
      </div>

      <p
        v-if="error"
        class="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200"
        role="alert"
      >
        {{ error
        }}<span v-if="stale">
          Exibindo a última leitura válida como desatualizada.</span
        >
      </p>
      <div
        v-if="loading"
        class="rounded-lg border border-border bg-surface p-6 text-sm text-muted"
      >
        Coletando métricas…
      </div>
      <div
        v-else-if="metrics?.status === 'disabled'"
        class="rounded-lg border border-border bg-surface p-6 text-sm text-muted"
      >
        A coleta de métricas está desabilitada nesta instalação. As demais ferramentas
        continuam disponíveis.
      </div>
      <template v-else-if="metrics?.metrics">
        <p v-if="stale" class="text-sm text-amber-200">
          Leitura desatualizada:
          {{ new Date(metrics.collectedAt).toLocaleString('pt-BR') }}
        </p>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <article class="rounded-lg border border-border bg-surface p-4">
            <div class="flex items-center gap-2 text-muted">
              <Activity :size="17" />CPU
            </div>
            <p class="mt-3 text-2xl font-semibold">
              {{ formatPercent(metrics.metrics.cpu?.usagePercent) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              Carga: {{ metrics.metrics.cpu?.load1 ?? 'Indisponível' }} ·
              {{ metrics.metrics.cpu?.cores ?? '—' }} núcleos
            </p>
          </article>
          <article class="rounded-lg border border-border bg-surface p-4">
            <div class="flex items-center gap-2 text-muted">
              <MemoryStick :size="17" />Memória
            </div>
            <p class="mt-3 text-2xl font-semibold">
              {{ formatPercent(metrics.metrics.memory?.usedPercent) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ formatBytes(metrics.metrics.memory?.usedBytes) }} de
              {{ formatBytes(metrics.metrics.memory?.totalBytes) }}
            </p>
          </article>
          <article class="rounded-lg border border-border bg-surface p-4">
            <div class="flex items-center gap-2 text-muted">
              <HardDrive :size="17" />Disco
            </div>
            <p class="mt-3 text-2xl font-semibold">
              {{ formatPercent(metrics.metrics.disk?.usedPercent) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ formatBytes(metrics.metrics.disk?.usedBytes) }} de
              {{ formatBytes(metrics.metrics.disk?.totalBytes) }}
            </p>
          </article>
          <article class="rounded-lg border border-border bg-surface p-4">
            <div class="flex items-center gap-2 text-muted">
              <Network :size="17" />Rede
            </div>
            <p class="mt-3 text-xl font-semibold">
              ↓ {{ formatBytes(metrics.metrics.network?.receivedBytesPerSecond) }}/s
            </p>
            <p class="mt-1 text-xs text-muted">
              ↑ {{ formatBytes(metrics.metrics.network?.sentBytesPerSecond) }}/s
            </p>
          </article>
          <article class="rounded-lg border border-border bg-surface p-4">
            <div class="flex items-center gap-2 text-muted">
              <Timer :size="17" />Uptime
            </div>
            <p class="mt-3 text-2xl font-semibold">
              {{ formatUptime(metrics.metrics.uptimeSeconds) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              Última leitura:
              {{ new Date(metrics.collectedAt).toLocaleString('pt-BR') }}
            </p>
          </article>
        </div>
        <section class="rounded-lg border border-border bg-surface p-5">
          <h3 class="font-semibold">CPU e memória</h3>
          <p class="mt-1 text-sm text-muted">
            Últimas {{ history.length }} leituras. Valores ausentes permanecem como
            lacunas.
          </p>
          <div v-if="LineChart" class="mt-5 h-64">
            <component
              :is="LineChart"
              :data="chartData"
              :options="chartOptions"
              aria-label="Gráfico de CPU e memória"
            />
          </div>
          <p v-else class="mt-5 text-sm text-muted">Preparando gráfico…</p>
        </section>
      </template>
      <div
        v-else
        class="rounded-lg border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200"
      >
        As métricas não estão disponíveis no momento.
      </div>
    </section>
  </AppShell>
</template>
