<script setup>
import {
  Activity,
  HardDrive,
  MemoryStick,
  Network,
  Server,
  Timer
} from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';

import AppShell from '@/components/layout/AppShell.vue';
import { useTheme } from '@/composables/useTheme';
import { formatBytes, formatPercent, formatUptime } from '@/features/dashboard/format';
import { api } from '@/services/api';

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const MIN_POLL_INTERVAL_MS = 5_000;
const SAMPLES_PER_REFRESH = 3;
const RENDER_LIMITS = { '1h': 240, '6h': 360, '24h': 480 };
const metrics = ref(null);
const history = ref([]);
const range = ref('1h');
const scaleMode = ref(localStorage.getItem('dashboard-chart-scale') === 'fixed' ? 'fixed' : 'auto');
const loading = ref(true);
const refreshing = ref(false);
const error = ref('');
const stale = ref(false);
const LineChart = shallowRef(null);
const { resolvedTheme } = useTheme();
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

function formatChartTime(sample) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(sample.collectedAt));
}

function metricValue(sample, type) {
  const value = type === 'cpu'
    ? sample.metrics?.cpu?.usagePercent
    : sample.metrics?.memory?.usedPercent;
  return Number.isFinite(value) ? value : null;
}

function downsampleSamples(samples, limit) {
  if (samples.length <= limit) return samples;

  const interior = samples.slice(1, -1);
  const bucketCount = Math.max(1, Math.floor((limit - 2) / 4));
  const bucketSize = interior.length / bucketCount;
  const selected = [samples[0]];

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const start = Math.floor(bucketIndex * bucketSize);
    const end = Math.min(interior.length, Math.max(start + 1, Math.floor((bucketIndex + 1) * bucketSize)));
    const bucket = interior.slice(start, end);
    if (!bucket.length) continue;

    const candidates = new Set([0, bucket.length - 1]);
    for (const type of ['cpu', 'memory']) {
      let minIndex = -1;
      let maxIndex = -1;
      let minValue = Infinity;
      let maxValue = -Infinity;
      bucket.forEach((sample, index) => {
        const value = metricValue(sample, type);
        if (value === null) return;
        if (value < minValue) {
          minValue = value;
          minIndex = index;
        }
        if (value > maxValue) {
          maxValue = value;
          maxIndex = index;
        }
      });
      if (minIndex >= 0) candidates.add(minIndex);
      if (maxIndex >= 0) candidates.add(maxIndex);
    }

    [...candidates]
      .sort((left, right) => left - right)
      .forEach((index) => selected.push(bucket[index]));
  }

  selected.push(samples.at(-1));
  return selected;
}

const chartSamples = computed(() => downsampleSamples(history.value, RENDER_LIMITS[range.value]));

function adaptiveBounds(values, includeZero) {
  if (scaleMode.value === 'fixed') return { min: 0, max: 100 };

  const valid = values.filter(Number.isFinite);
  if (!valid.length) return includeZero ? { min: 0, max: 10 } : { min: 0, max: 100 };

  const observedMin = Math.min(...valid);
  const observedMax = Math.max(...valid);
  const observedSpan = Math.max(observedMax - observedMin, 1);
  const padding = Math.max(observedSpan * 0.25, includeZero ? 2 : 1);
  let min = includeZero ? 0 : Math.max(0, Math.floor((observedMin - padding) / 2) * 2);
  let max = Math.min(100, Math.ceil((observedMax + padding) / 2) * 2);
  const minimumSpan = includeZero ? 10 : 8;

  if (max - min < minimumSpan) {
    if (includeZero) {
      max = Math.min(100, minimumSpan);
    } else {
      const center = (observedMin + observedMax) / 2;
      min = Math.max(0, Math.floor(center - minimumSpan / 2));
      max = Math.min(100, min + minimumSpan);
      if (max - min < minimumSpan) min = Math.max(0, max - minimumSpan);
    }
  }

  return { min, max };
}

function tickStep(bounds) {
  const span = bounds.max - bounds.min;
  if (span <= 10) return 2;
  if (span <= 20) return 5;
  if (span <= 50) return 10;
  return 20;
}

const cpuBounds = computed(() => adaptiveBounds(chartSamples.value.map((sample) => metricValue(sample, 'cpu')), true));
const memoryBounds = computed(() => adaptiveBounds(chartSamples.value.map((sample) => metricValue(sample, 'memory')), false));
const chartTheme = computed(() => resolvedTheme.value === 'dark'
  ? {
      text: '#8b949e',
      grid: 'rgba(139, 148, 158, 0.16)',
      border: 'rgba(139, 148, 158, 0.28)',
      tooltipBackground: '#161b22',
      tooltipBorder: '#30363d',
      tooltipText: '#f0f6fc'
    }
  : {
      text: '#57606a',
      grid: 'rgba(87, 96, 106, 0.14)',
      border: 'rgba(87, 96, 106, 0.24)',
      tooltipBackground: '#ffffff',
      tooltipBorder: '#d0d7de',
      tooltipText: '#1f2328'
    });

const chartData = computed(() => ({
  labels: chartSamples.value.map(formatChartTime),
  datasets: [
    {
      label: 'CPU (%)',
      data: chartSamples.value.map((sample) => metricValue(sample, 'cpu')),
      yAxisID: 'cpu',
      borderColor: '#2f81f7',
      backgroundColor: resolvedTheme.value === 'dark' ? 'rgba(47, 129, 247, 0.14)' : 'rgba(9, 105, 218, 0.10)',
      borderWidth: 2,
      tension: 0.18,
      fill: true,
      spanGaps: true,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHitRadius: 12
    },
    {
      label: 'Memória (%)',
      data: chartSamples.value.map((sample) => metricValue(sample, 'memory')),
      yAxisID: 'memory',
      borderColor: '#2da44e',
      backgroundColor: resolvedTheme.value === 'dark' ? 'rgba(63, 185, 80, 0.10)' : 'rgba(45, 164, 78, 0.08)',
      borderWidth: 2,
      tension: 0.18,
      fill: true,
      spanGaps: true,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHitRadius: 12
    }
  ]
}));

const chartOptions = computed(() => {
  const colors = chartTheme.value;
  const cpu = cpuBounds.value;
  const memory = memoryBounds.value;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    resizeDelay: 120,
    devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    normalized: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: {
          color: colors.text,
          usePointStyle: true,
          pointStyle: 'line',
          boxWidth: 18,
          padding: 18
        }
      },
      tooltip: {
        backgroundColor: colors.tooltipBackground,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        titleColor: colors.tooltipText,
        bodyColor: colors.tooltipText,
        displayColors: true,
        callbacks: {
          title(items) {
            const sample = chartSamples.value[items[0]?.dataIndex];
            return sample
              ? new Intl.DateTimeFormat('pt-BR', {
                  year: 'numeric',
                  month: 'short',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hourCycle: 'h23',
                  timeZoneName: 'short'
                }).format(new Date(sample.collectedAt))
              : '';
          }
        }
      }
    },
    scales: {
      x: {
        ticks: { color: colors.text, maxTicksLimit: 6, maxRotation: 0 },
        grid: { display: false },
        border: { color: colors.border }
      },
      cpu: {
        type: 'linear',
        position: 'left',
        min: cpu.min,
        max: cpu.max,
        ticks: {
          color: '#2f81f7',
          stepSize: tickStep(cpu),
          callback: (value) => `${value}%`
        },
        grid: { color: colors.grid, lineWidth: 1 },
        border: { color: colors.border }
      },
      memory: {
        type: 'linear',
        position: 'right',
        min: memory.min,
        max: memory.max,
        ticks: {
          color: '#2da44e',
          stepSize: tickStep(memory),
          callback: (value) => `${value}%`
        },
        grid: { drawOnChartArea: false },
        border: { color: colors.border }
      }
    }
  };
});

const chartKey = computed(() => `${resolvedTheme.value}-${scaleMode.value}-${range.value}`);
const scaleDescription = computed(() => scaleMode.value === 'fixed'
  ? 'Escala absoluta de 0% a 100% para as duas séries.'
  : `Escala automática: CPU ${cpuBounds.value.min}%–${cpuBounds.value.max}% · Memória ${memoryBounds.value.min}%–${memoryBounds.value.max}%.`);

async function loadChart() {
  if (LineChart.value) return;
  const [{ Line }, chart] = await Promise.all([
    import('vue-chartjs'),
    import('chart.js/auto')
  ]);
  void chart;
  LineChart.value = Line;
}

function refreshIntervalMs() {
  const samplingSeconds = Number(metrics.value?.samplingIntervalSeconds);
  if (!Number.isFinite(samplingSeconds) || samplingSeconds <= 0)
    return DEFAULT_POLL_INTERVAL_MS;
  return Math.max(
    MIN_POLL_INTERVAL_MS,
    Math.round(samplingSeconds * 1_000 * SAMPLES_PER_REFRESH)
  );
}

async function refresh() {
  if (refreshing.value) return;
  refreshing.value = true;
  error.value = '';
  try {
    const next = await api(`/api/system/metrics?range=${range.value}`);
    metrics.value = next;
    stale.value = false;
    if (next.metrics) {
      history.value = next.history ?? [];
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

function scheduleNextRefresh() {
  window.clearTimeout(timer);
  if (document.hidden) return;
  timer = window.setTimeout(async () => {
    await refresh();
    scheduleNextRefresh();
  }, refreshIntervalMs());
}

async function refreshAndSchedule() {
  await refresh();
  scheduleNextRefresh();
}

function onVisibilityChange() {
  window.clearTimeout(timer);
  if (!document.hidden) void refreshAndSchedule();
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange);
  void refreshAndSchedule();
});
watch(range, () => {
  window.clearTimeout(timer);
  void refreshAndSchedule();
});
watch(scaleMode, (value) => localStorage.setItem('dashboard-chart-scale', value));
onBeforeUnmount(() => {
  window.clearTimeout(timer);
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
        <span
          class="inline-flex items-center gap-2 text-sm"
          aria-live="polite"
          title="As métricas são atualizadas automaticamente"
        >
          <span class="size-2 rounded-full" :class="statusClass" />{{ statusLabel }}
        </span>
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
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 class="font-semibold">CPU e memória</h3>
              <p class="mt-1 text-sm text-muted">
                {{ history.length }} leituras no intervalo. Coleta a cada
                {{ metrics.samplingIntervalSeconds ?? 5 }} s; lacunas não são simuladas.
                <span v-if="chartSamples.length < history.length">
                  {{ chartSamples.length }} pontos representativos são renderizados.
                </span>
              </p>
              <p class="mt-1 text-xs text-muted">{{ scaleDescription }}</p>
            </div>
            <div class="flex flex-wrap gap-3">
              <label class="text-sm">
                <span class="mb-1 block text-xs text-muted">Intervalo</span>
                <select v-model="range" class="min-h-10 rounded-md border border-border bg-canvas px-3">
                  <option value="1h">Última hora</option>
                  <option value="6h">Últimas 6 horas</option>
                  <option value="24h">Últimas 24 horas</option>
                </select>
              </label>
              <label class="text-sm">
                <span class="mb-1 block text-xs text-muted">Escala</span>
                <select v-model="scaleMode" class="min-h-10 rounded-md border border-border bg-canvas px-3">
                  <option value="auto">Automática</option>
                  <option value="fixed">0–100%</option>
                </select>
              </label>
            </div>
          </div>
          <div v-if="LineChart" class="mt-5 h-72">
            <component
              :is="LineChart"
              :key="chartKey"
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
