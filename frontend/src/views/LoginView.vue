<script setup>
import { Activity, Eye, EyeOff, ShieldCheck } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import AppButton from '@/components/base/AppButton.vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const loading = ref(false);
const error = ref('');
const showPassword = ref(false);
const setupResult = ref(null);
const useRecoveryCode = ref(false);
const clientMetadata = ref({
  userAgent: navigator.userAgent,
  ipAddress: ''
});
const form = ref({
  bootstrapToken: '',
  username: '',
  password: '',
  totpCode: '',
  recoveryCode: ''
});
const isSetup = computed(() => auth.setupRequired && !setupResult.value);

async function loadInitialState() {
  await auth.restore();
  try {
    const response = await fetch('/api/health', {
      cache: 'no-store',
      credentials: 'same-origin'
    });
    clientMetadata.value.ipAddress = response.headers.get('x-client-ip') ?? '';
  } catch {
    // Em desenvolvimento local o proxy pode não fornecer o IP. O login segue normalmente.
  }
}

onMounted(loadInitialState);

async function submit() {
  loading.value = true;
  error.value = '';
  try {
    if (isSetup.value) {
      setupResult.value = await auth.initialize({
        bootstrapToken: form.value.bootstrapToken,
        username: form.value.username,
        password: form.value.password
      });
      return;
    }
    await auth.login({
      username: form.value.username,
      password: form.value.password,
      totpCode: useRecoveryCode.value ? undefined : form.value.totpCode,
      recoveryCode: useRecoveryCode.value ? form.value.recoveryCode : undefined,
      userAgent: clientMetadata.value.userAgent,
      ipAddress: clientMetadata.value.ipAddress || undefined
    });
    await router.replace({ name: 'dashboard' });
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-canvas px-4 py-10 text-foreground">
    <section class="w-full max-w-md rounded-lg border border-border bg-surface p-6 sm:p-8" aria-labelledby="login-title">
      <div class="flex items-center gap-3 text-accent">
        <span class="rounded-md border border-border bg-elevated p-2">
          <Activity :size="20" aria-hidden="true" />
        </span>
        <span class="text-sm font-medium">Painel de Utilidades Privado</span>
      </div>
      <h1 id="login-title" class="mt-8 text-2xl font-semibold tracking-tight">
        {{
          setupResult
            ? 'Configure seu autenticador'
            : isSetup
              ? 'Configuração inicial'
              : 'Entrada protegida'
        }}
      </h1>
      <p class="mt-3 text-sm leading-6 text-muted">
        {{
          setupResult
            ? 'Adicione a chave ao aplicativo autenticador e guarde os códigos de recuperação fora desta máquina.'
            : isSetup
              ? 'Crie o administrador usando o token de instalação obtido no servidor.'
              : 'Este dispositivo permanecerá conectado até a sessão ser revogada ou expirar.'
        }}
      </p>
      <p v-if="error" class="mt-5 rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-200" role="alert">
        {{ error }}
      </p>
      <div v-if="setupResult" class="mt-6 space-y-4 text-sm">
        <label class="block text-muted">
          URI TOTP
          <textarea readonly class="mt-1 min-h-24 w-full rounded-md border border-border bg-canvas p-3 font-mono text-xs text-foreground" :value="setupResult.totpUri" />
        </label>
        <div>
          <p class="font-medium">Códigos de recuperação</p>
          <p class="mt-1 break-words font-mono text-xs text-muted">
            {{ setupResult.recoveryCodes.join(' · ') }}
          </p>
        </div>
        <AppButton class="w-full" @click="setupResult = null">Continuar para o login</AppButton>
      </div>
      <form v-else class="mt-8 space-y-4" @submit.prevent="submit">
        <label v-if="isSetup" class="block text-sm">
          <span>Token de instalação</span>
          <input v-model="form.bootstrapToken" class="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2" autocomplete="off" required />
        </label>
        <label class="block text-sm">
          <span>Usuário</span>
          <input v-model="form.username" class="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2" autocomplete="username" required />
        </label>
        <label class="block text-sm">
          <span>Senha</span>
          <span class="relative mt-1 block">
            <input v-model="form.password" class="w-full rounded-md border border-border bg-canvas px-3 py-2 pr-10" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" required />
            <button class="absolute inset-y-0 right-0 px-3 text-muted" type="button" :aria-label="showPassword ? 'Ocultar senha' : 'Mostrar senha'" @click="showPassword = !showPassword">
              <EyeOff v-if="showPassword" :size="17" />
              <Eye v-else :size="17" />
            </button>
          </span>
        </label>
        <template v-if="!isSetup">
          <label class="block text-sm">
            <span>{{ useRecoveryCode ? 'Código de recuperação' : 'Código TOTP' }}</span>
            <input
              :value="useRecoveryCode ? form.recoveryCode : form.totpCode"
              class="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2"
              :autocomplete="useRecoveryCode ? 'off' : 'one-time-code'"
              required
              @input="
                useRecoveryCode
                  ? (form.recoveryCode = $event.target.value)
                  : (form.totpCode = $event.target.value)
              "
            />
          </label>
          <button class="text-sm text-accent hover:underline" type="button" @click="useRecoveryCode = !useRecoveryCode">
            {{ useRecoveryCode ? 'Usar TOTP' : 'Usar código de recuperação' }}
          </button>
        </template>
        <AppButton class="w-full" type="submit" :loading="loading">
          {{ isSetup ? 'Criar administrador' : 'Entrar' }}
        </AppButton>
      </form>
      <div class="mt-6 flex gap-3 rounded-md border border-border bg-canvas p-4 text-sm text-muted">
        <ShieldCheck :size="20" class="shrink-0 text-green-400" aria-hidden="true" />
        Sessões persistentes são mantidas em cookie inacessível ao JavaScript.
      </div>
    </section>
  </main>
</template>
