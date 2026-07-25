<script setup>
import { AlertTriangle, Globe2, Monitor, RefreshCcw, ShieldCheck } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';

import AppButton from '@/components/base/AppButton.vue';
import AppShell from '@/components/layout/AppShell.vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const sessions = ref([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const changing = ref(false);

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function sessionTitle(session) {
  if (session.deviceName && session.browserName) {
    return `${session.deviceName} · ${session.browserName}`;
  }
  return session.deviceLabel || 'Dispositivo não identificado';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    sessions.value = await auth.getSessions();
  } catch (caught) {
    error.value = caught.message;
  } finally {
    loading.value = false;
  }
}

async function revoke(session) {
  if (!window.confirm(`Revogar o acesso de “${sessionTitle(session)}”?`)) return;
  changing.value = true;
  error.value = '';
  try {
    await auth.revokeSession(session.id);
    notice.value = 'A sessão foi revogada.';
    await load();
  } catch (caught) {
    error.value = caught.message;
  } finally {
    changing.value = false;
  }
}

async function revokeOthers() {
  if (!window.confirm('Revogar todas as outras sessões confiáveis?')) return;
  changing.value = true;
  error.value = '';
  try {
    const result = await auth.revokeOtherSessions();
    notice.value = `${result.revoked} sessão(ões) revogada(s).`;
    await load();
  } catch (caught) {
    error.value = caught.message;
  } finally {
    changing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <AppShell>
    <section class="max-w-3xl space-y-6">
      <div class="rounded-lg border border-border bg-surface p-5">
        <div class="flex gap-3">
          <ShieldCheck class="mt-0.5 shrink-0 text-accent" :size="21" aria-hidden="true" />
          <div>
            <h2 class="font-semibold">Sessões confiáveis</h2>
            <p class="mt-1 text-sm text-muted">
              Confira o dispositivo, navegador e endereço IP antes de manter uma sessão ativa.
            </p>
          </div>
        </div>
        <div class="mt-5 flex flex-wrap gap-3">
          <AppButton variant="secondary" :disabled="loading || changing" @click="load">
            <RefreshCcw :size="16" aria-hidden="true" /> Atualizar
          </AppButton>
          <AppButton
            variant="danger"
            :disabled="loading || changing || sessions.length < 2"
            @click="revokeOthers"
          >
            Revogar outras sessões
          </AppButton>
        </div>
      </div>

      <p v-if="notice" class="rounded-md border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-200" role="status">
        {{ notice }}
      </p>
      <p v-if="error" class="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
        {{ error }}
      </p>

      <div v-if="loading" class="rounded-lg border border-border bg-surface p-5 text-sm text-muted">
        Carregando sessões…
      </div>
      <div v-else-if="sessions.length === 0" class="rounded-lg border border-border bg-surface p-5 text-sm text-muted">
        Nenhuma sessão ativa foi encontrada.
      </div>
      <ul v-else class="divide-y divide-border rounded-lg border border-border bg-surface">
        <li v-for="session in sessions" :key="session.id" class="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
          <Monitor class="shrink-0 text-muted" :size="21" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium">{{ sessionTitle(session) }}</p>
              <span v-if="session.current" class="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">Atual</span>
            </div>
            <div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <span class="inline-flex items-center gap-1.5">
                <Globe2 :size="14" aria-hidden="true" />
                IP: {{ session.ipAddress || 'não disponível' }}
              </span>
              <span>Última atividade: {{ formatDate(session.lastUsedAt) }}</span>
            </div>
          </div>
          <AppButton v-if="!session.current" variant="danger" :disabled="changing" @click="revoke(session)">
            Revogar
          </AppButton>
        </li>
      </ul>

      <p class="flex gap-2 text-xs text-muted">
        <AlertTriangle :size="15" aria-hidden="true" />
        Sessões antigas podem não possuir detalhes do dispositivo. Eles serão registrados no próximo login.
      </p>
    </section>
  </AppShell>
</template>
