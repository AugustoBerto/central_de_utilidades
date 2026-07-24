<script setup>
import { AlertTriangle, CheckCircle2, Play, Square, Terminal } from 'lucide-vue-next';
import { onBeforeUnmount, onMounted, ref } from 'vue';

import AppButton from '@/components/base/AppButton.vue';
import AppShell from '@/components/layout/AppShell.vue';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const automations = ref([]);
const selected = ref(null);
const run = ref(null);
const repeat = ref(1);
const loading = ref(true);
const starting = ref(false);
const error = ref('');
let source;

async function load() {
  loading.value = true;
  error.value = '';
  try {
    automations.value = (await api('/api/automations')).automations;
    selected.value ??= automations.value[0] ?? null;
  } catch (caught) {
    error.value = caught.message;
  } finally {
    loading.value = false;
  }
}

function connectEvents(runId) {
  source?.close();
  source = new EventSource(`/api/automation-runs/${runId}/events`);
  source.addEventListener('update', (event) => {
    run.value = JSON.parse(event.data);
    if (['cancelled', 'failed', 'succeeded', 'timed_out'].includes(run.value.status)) {
      source.close();
      load();
    }
  });
  source.onerror = () => source.close();
}

async function start() {
  if (!selected.value) return;
  if (
    !window.confirm(
      `Executar “${selected.value.title}” ${repeat.value} vez(es)? ${selected.value.impact}`
    )
  )
    return;
  starting.value = true;
  error.value = '';
  try {
    const response = await api(`/api/automations/${selected.value.id}/runs`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': auth.csrfToken },
      body: { parameters: { repeat: Number(repeat.value) } }
    });
    run.value = response.run;
    connectEvents(run.value.id);
  } catch (caught) {
    error.value = caught.message;
  } finally {
    starting.value = false;
  }
}

async function cancel() {
  if (!run.value || !window.confirm('Cancelar esta execução?')) return;
  try {
    run.value = (
      await api(`/api/automation-runs/${run.value.id}/cancel`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': auth.csrfToken }
      })
    ).run;
  } catch (caught) {
    error.value = caught.message;
  }
}

onMounted(load);
onBeforeUnmount(() => source?.close());
</script>

<template>
  <AppShell>
    <section class="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <aside class="rounded-lg border border-border bg-surface p-4">
        <h2 class="font-semibold">Catálogo autorizado</h2>
        <p class="mt-1 text-sm text-muted">Nenhum comando é aceito pelo navegador.</p>
        <p v-if="loading" class="mt-5 text-sm text-muted">Carregando…</p>
        <ul v-else class="mt-4 space-y-2">
          <li v-for="automation in automations" :key="automation.id">
            <button
              class="w-full rounded-md border p-3 text-left"
              :class="
                selected?.id === automation.id
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:bg-elevated'
              "
              @click="selected = automation"
            >
              <p class="font-medium">{{ automation.title }}</p>
              <p class="mt-1 text-xs text-muted">
                {{ automation.available ? 'Disponível' : 'Desabilitada' }}
              </p>
            </button>
          </li>
        </ul>
      </aside>
      <div class="space-y-6">
        <p
          v-if="error"
          class="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200"
          role="alert"
        >
          {{ error }}
        </p>
        <div
          v-if="!selected"
          class="rounded-lg border border-border bg-surface p-6 text-muted"
        >
          Nenhuma automação autorizada.
        </div>
        <template v-else
          ><section class="rounded-lg border border-border bg-surface p-6">
            <div class="flex gap-3">
              <Terminal class="mt-0.5 text-accent" :size="22" aria-hidden="true" />
              <div>
                <h2 class="font-semibold">{{ selected.title }}</h2>
                <p class="mt-1 text-sm text-muted">{{ selected.description }}</p>
              </div>
            </div>
            <div
              class="mt-5 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100"
            >
              <AlertTriangle class="mr-2 inline" :size="16" aria-hidden="true" />{{
                selected.impact
              }}
            </div>
            <label class="mt-5 block max-w-xs text-sm"
              ><span>Repetições</span
              ><input
                v-model.number="repeat"
                class="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2"
                type="number"
                min="1"
                max="3"
                :disabled="!selected.available || starting" /></label
            ><AppButton
              class="mt-5"
              :loading="starting"
              :disabled="
                !selected.available ||
                run?.status === 'running' ||
                run?.status === 'queued'
              "
              @click="start"
              ><Play :size="16" aria-hidden="true" />Executar diagnóstico</AppButton
            >
            <p v-if="!selected.available" class="mt-3 text-sm text-muted">
              Defina <code>AUTOMATIONS_ENABLED=true</code> para habilitar este catálogo.
            </p>
          </section>
          <section v-if="run" class="rounded-lg border border-border bg-surface p-6">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="font-semibold">Execução</h2>
                <p class="mt-1 text-sm text-muted">Status: {{ run.status }}</p>
              </div>
              <AppButton
                v-if="run.status === 'running' || run.status === 'queued'"
                variant="danger"
                @click="cancel"
                ><Square :size="16" aria-hidden="true" />Cancelar</AppButton
              ><CheckCircle2
                v-else-if="run.status === 'succeeded'"
                class="text-green-400"
                :size="22"
                aria-hidden="true"
              />
            </div>
            <pre
              class="mt-5 max-h-72 overflow-auto rounded-md border border-border bg-canvas p-4 text-xs text-muted"
              >{{ run.output || 'Aguardando saída sanitizada…' }}</pre
            >
            <p v-if="run.completedAt" class="mt-3 text-xs text-muted">
              Concluída em {{ new Date(run.completedAt).toLocaleString('pt-BR') }} ·
              {{ run.durationMs }} ms
            </p>
          </section></template
        >
      </div>
    </section>
  </AppShell>
</template>
