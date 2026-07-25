<script setup>
import { AlertTriangle, LogOut, Monitor, RefreshCcw, ShieldCheck, User } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import AppButton from '@/components/base/AppButton.vue';
import AppShell from '@/components/layout/AppShell.vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const sessions = ref([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const changing = ref(false);
const loggingOut = ref(false);

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
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

async function logout() {
  loggingOut.value = true;
  error.value = '';
  try {
    await auth.logout();
    await router.replace({ name: 'login' });
  } catch (caught) {
    error.value = caught.message;
    loggingOut.value = false;
  }
}

async function revoke(session) {
  if (!window.confirm(`Revogar o acesso de “${session.deviceLabel}”?`)) return;
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
        <div class="flex flex-wrap items-center gap-4">
          <span class="rounded-md border border-border bg-elevated p-2 text-accent">
            <User :size="21" aria-hidden="true" />
          </span>
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold">Conta</h2>
            <p class="mt-1 truncate text-sm text-muted">
              Usuário conectado: <span class="text-foreground">{{ auth.user?.username }}</span>
            </p>
          </div>
          <AppButton variant="secondary" :loading="loggingOut" @click="logout">
            <LogOut :size="16" aria-hidden="true" />Sair da conta
          </AppButton>
        </div>
      </div>

      <div class="rounded-lg border border-border bg-surface p-5">
        <div class="flex gap-3">
          <ShieldCheck
            class="mt-0.5 shrink-0 text-accent"
            :size="21"
            aria-hidden="true"
          />
          <div>
            <h2 class="font-semibold">Sessões confiáveis</h2>
            <p class="mt-1 text-sm text-muted">
              Este navegador permanece conectado por cookie persistente. Revogue acessos
              que não reconheça.
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

      <p
        v-if="notice"
        class="rounded-md border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-200"
        role="status"
      >
        {{ notice }}
      </p>
      <p
        v-if="error"
        class="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200"
        role="alert"
      >
        {{ error }}
      </p>
      <div
        v-if="loading"
        class="rounded-lg border border-border bg-surface p-5 text-sm text-muted"
      >
        Carregando sessões…
      </div>
      <div
        v-else-if="sessions.length === 0"
        class="rounded-lg border border-border bg-surface p-5 text-sm text-muted"
      >
        Nenhuma sessão ativa foi encontrada.
      </div>
      <ul
        v-else
        class="divide-y divide-border rounded-lg border border-border bg-surface"
      >
        <li
          v-for="session in sessions"
          :key="session.id"
          class="flex items-center gap-4 p-4"
        >
          <Monitor class="shrink-0 text-muted" :size="20" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">
              {{ session.deviceLabel }}
              <span
                v-if="session.current"
                class="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent"
                >Atual</span
              >
            </p>
            <p class="mt-1 text-xs text-muted">
              Última atividade: {{ formatDate(session.lastUsedAt) }}
            </p>
          </div>
          <AppButton
            v-if="!session.current"
            variant="danger"
            :disabled="changing"
            @click="revoke(session)"
          >
            Revogar
          </AppButton>
        </li>
      </ul>
      <p class="flex gap-2 text-xs text-muted">
        <AlertTriangle :size="15" aria-hidden="true" /> Em rede HTTP, use somente VPN ou
        uma rede privada confiável.
      </p>
    </section>
  </AppShell>
</template>