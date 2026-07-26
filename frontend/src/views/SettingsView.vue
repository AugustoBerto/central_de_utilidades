<script setup>
import {
  AlertTriangle,
  Globe2,
  Laptop,
  LogOut,
  Monitor,
  Moon,
  RefreshCcw,
  ShieldCheck,
  Sun,
  User
} from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import AppButton from '@/components/base/AppButton.vue';
import AppShell from '@/components/layout/AppShell.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useTheme } from '@/composables/useTheme';
import DriveSettingsSection from '@/features/drive/DriveSettingsSection.vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const { confirm } = useConfirm();
const { preference, setTheme } = useTheme();
const sessions = ref([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const changing = ref(false);
const loggingOut = ref(false);

const themeOptions = [
  { value: 'light', label: 'Claro', description: 'Interface clara em todos os dispositivos.', icon: Sun },
  { value: 'dark', label: 'Escuro', description: 'Interface escura em todos os dispositivos.', icon: Moon },
  { value: 'system', label: 'Sistema', description: 'Acompanha a configuração do dispositivo.', icon: Laptop }
];

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function sessionTitle(session) {
  if (session.deviceName && session.browserName)
    return `${session.deviceName} · ${session.browserName}`;
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
  const accepted = await confirm({
    title: 'Revogar sessão?',
    message: `O acesso de “${sessionTitle(session)}” será encerrado.`,
    confirmLabel: 'Revogar',
    cancelLabel: 'Cancelar',
    variant: 'danger'
  });
  if (!accepted) return;
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
  const accepted = await confirm({
    title: 'Revogar outras sessões?',
    message: 'Todas as outras sessões confiáveis serão desconectadas.',
    confirmLabel: 'Revogar todas',
    cancelLabel: 'Cancelar',
    variant: 'danger'
  });
  if (!accepted) return;
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
    <section class="max-w-4xl space-y-6">
      <div class="rounded-lg border border-border bg-surface p-5">
        <div class="flex flex-wrap items-center gap-4">
          <span class="rounded-md border border-border bg-elevated p-2 text-accent"><User :size="21" aria-hidden="true" /></span>
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold">Conta</h2>
            <p class="mt-1 truncate text-sm text-muted">Usuário conectado: <span class="text-foreground">{{ auth.user?.username }}</span></p>
          </div>
          <AppButton variant="secondary" :loading="loggingOut" @click="logout"><LogOut :size="16" aria-hidden="true" />Sair da conta</AppButton>
        </div>
      </div>

      <div class="rounded-lg border border-border bg-surface p-5">
        <div class="flex gap-3">
          <Sun class="mt-0.5 shrink-0 text-accent" :size="21" aria-hidden="true" />
          <div>
            <h2 class="font-semibold">Aparência</h2>
            <p class="mt-1 text-sm text-muted">Escolha como o Painel de Utilidades deve aparecer.</p>
          </div>
        </div>
        <div class="mt-5 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Tema da aplicação">
          <button v-for="option in themeOptions" :key="option.value" type="button" role="radio" :aria-checked="preference === option.value" class="rounded-lg border p-4 text-left transition" :class="preference === option.value ? 'border-accent bg-accent/10' : 'border-border bg-canvas hover:border-accent/60'" @click="setTheme(option.value)">
            <component :is="option.icon" class="text-accent" :size="20" aria-hidden="true" />
            <span class="mt-3 block font-medium">{{ option.label }}</span>
            <span class="mt-1 block text-xs leading-5 text-muted">{{ option.description }}</span>
          </button>
        </div>
      </div>

      <DriveSettingsSection />

      <div class="rounded-lg border border-border bg-surface p-5">
        <div class="flex gap-3">
          <ShieldCheck class="mt-0.5 shrink-0 text-accent" :size="21" aria-hidden="true" />
          <div>
            <h2 class="font-semibold">Sessões confiáveis</h2>
            <p class="mt-1 text-sm text-muted">Confira o dispositivo, navegador e endereço IP antes de manter uma sessão ativa.</p>
          </div>
        </div>
        <div class="mt-5 flex flex-wrap gap-3">
          <AppButton variant="secondary" :disabled="loading || changing" @click="load"><RefreshCcw :size="16" aria-hidden="true" />Atualizar</AppButton>
          <AppButton variant="danger" :disabled="loading || changing || sessions.length < 2" @click="revokeOthers">Revogar outras sessões</AppButton>
        </div>
      </div>

      <p v-if="notice" class="rounded-md border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-600" role="status" aria-live="polite">{{ notice }}</p>
      <p v-if="error" class="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500" role="alert">{{ error }}</p>
      <div v-if="loading" class="rounded-lg border border-border bg-surface p-5 text-sm text-muted">Carregando sessões…</div>
      <div v-else-if="sessions.length === 0" class="rounded-lg border border-border bg-surface p-5 text-sm text-muted">Nenhuma sessão ativa foi encontrada.</div>
      <ul v-else class="divide-y divide-border rounded-lg border border-border bg-surface">
        <li v-for="session in sessions" :key="session.id" class="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
          <Monitor class="shrink-0 text-muted" :size="21" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium">{{ sessionTitle(session) }}</p>
              <span v-if="session.current" class="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">Atual</span>
            </div>
            <div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <span class="inline-flex items-center gap-1.5"><Globe2 :size="14" aria-hidden="true" />IP: {{ session.ipAddress || 'não disponível' }}</span>
              <span>Última atividade: {{ formatDate(session.lastUsedAt) }}</span>
            </div>
          </div>
          <AppButton v-if="!session.current" variant="danger" :disabled="changing" @click="revoke(session)">Revogar</AppButton>
        </li>
      </ul>
      <p class="flex gap-2 text-xs text-muted"><AlertTriangle class="mt-0.5 shrink-0" :size="15" aria-hidden="true" />Sessões antigas podem não possuir detalhes do dispositivo; os campos serão preenchidos no próximo login.</p>
      <p class="flex gap-2 text-xs text-muted"><AlertTriangle class="mt-0.5 shrink-0" :size="15" aria-hidden="true" />Em rede HTTP, use somente VPN ou uma rede privada confiável.</p>
    </section>
  </AppShell>
</template>
