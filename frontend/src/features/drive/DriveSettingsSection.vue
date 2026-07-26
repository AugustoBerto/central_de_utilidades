<script setup>
import { AlertTriangle, HardDrive, Save } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref } from 'vue';

import AppButton from '@/components/base/AppButton.vue';
import {
  buildDriveSettingsPayload,
  bytesToGiB
} from '@/features/drive/drive-settings';
import { formatBytes } from '@/features/dashboard/format';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const status = ref(null);
const fields = reactive({ reservedGiB: '', maxUploadGiB: '' });
const fieldErrors = reactive({ reservedGiB: '', maxUploadGiB: '' });

const usagePercent = computed(() =>
  Math.min(100, Math.max(0, status.value?.usedPercent ?? 0))
);
const physicalLimit = computed(() => {
  const value = status.value;
  return Boolean(
    value &&
      value.physicalFreeBytes !== null &&
      value.physicalFreeBytes < value.quotaFreeBytes
  );
});

function syncFields(value) {
  fields.reservedGiB = String(bytesToGiB(value.reservedBytes));
  fields.maxUploadGiB = String(bytesToGiB(value.maxUploadBytes));
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    status.value = await api('/api/drive/status');
    syncFields(status.value);
  } catch (caught) {
    error.value = caught.message;
  } finally {
    loading.value = false;
  }
}

async function save() {
  notice.value = '';
  error.value = '';
  fieldErrors.reservedGiB = '';
  fieldErrors.maxUploadGiB = '';

  const validation = buildDriveSettingsPayload(fields, {
    usedBytes: status.value?.usedBytes ?? 0,
    uploadHardLimitBytes: status.value?.uploadHardLimitBytes
  });
  Object.assign(fieldErrors, validation.errors);
  if (!validation.payload) return;

  saving.value = true;
  try {
    const result = await api('/api/drive/settings', {
      method: 'PATCH',
      headers: { 'X-CSRF-Token': auth.csrfToken },
      body: validation.payload
    });
    status.value = result.status;
    syncFields(status.value);
    notice.value = 'Configurações do Drive salvas. Os novos limites já estão ativos.';
  } catch (caught) {
    fieldErrors.reservedGiB = caught.fields?.reservedBytes ?? '';
    fieldErrors.maxUploadGiB = caught.fields?.maxUploadBytes ?? '';
    if (!fieldErrors.reservedGiB && !fieldErrors.maxUploadGiB)
      error.value = caught.message;
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="rounded-lg border border-border bg-surface p-5" aria-labelledby="drive-settings-title">
    <div class="flex gap-3">
      <HardDrive class="mt-0.5 shrink-0 text-accent" :size="21" aria-hidden="true" />
      <div>
        <h2 id="drive-settings-title" class="font-semibold">Drive Pessoal</h2>
        <p class="mt-1 text-sm text-muted">
          Defina a cota reservada e o tamanho máximo permitido para cada arquivo.
        </p>
      </div>
    </div>

    <div v-if="loading" class="mt-5 text-sm text-muted">Carregando armazenamento…</div>

    <template v-else-if="status">
      <div class="mt-5 rounded-lg border border-border bg-canvas p-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <p class="text-sm font-medium">
            {{ formatBytes(status.usedBytes) }} de {{ formatBytes(status.reservedBytes) }} utilizados
          </p>
          <p class="text-sm text-muted">
            {{ formatBytes(status.effectiveFreeBytes) }} disponíveis
          </p>
        </div>
        <div
          class="mt-3 h-2 overflow-hidden rounded-full bg-elevated"
          role="progressbar"
          aria-label="Uso do armazenamento do Drive"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Math.round(usagePercent)"
        >
          <div class="h-full rounded-full bg-accent transition-[width]" :style="{ width: `${usagePercent}%` }" />
        </div>
        <div class="mt-3 grid gap-1 text-xs text-muted sm:grid-cols-2">
          <span>Disponível pela cota: {{ formatBytes(status.quotaFreeBytes) }}</span>
          <span>
            Livre no disco:
            {{ status.physicalFreeBytes === null ? 'indisponível' : formatBytes(status.physicalFreeBytes) }}
          </span>
          <span>Limite da instalação: {{ formatBytes(status.uploadHardLimitBytes) }}</span>
          <span>Máximo atual por arquivo: {{ formatBytes(status.maxUploadBytes) }}</span>
        </div>
        <p v-if="physicalLimit" class="mt-3 flex gap-2 text-xs text-amber-500">
          <AlertTriangle class="mt-0.5 shrink-0" :size="14" aria-hidden="true" />
          O disco físico possui menos espaço livre que a cota. O Drive usa sempre o menor valor disponível.
        </p>
      </div>

      <form class="mt-5 grid gap-4 sm:grid-cols-2" @submit.prevent="save">
        <label class="text-sm font-medium" for="drive-reserved-gib">
          Espaço reservado ao Drive (GiB)
          <input
            id="drive-reserved-gib"
            v-model="fields.reservedGiB"
            type="number"
            min="0.01"
            step="0.01"
            inputmode="decimal"
            class="mt-2 min-h-11 w-full rounded-md border border-border bg-canvas px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            :aria-invalid="Boolean(fieldErrors.reservedGiB)"
            aria-describedby="drive-reserved-help drive-reserved-error"
          />
          <span id="drive-reserved-help" class="mt-1 block text-xs font-normal text-muted">
            Não pode ser menor que o espaço já utilizado.
          </span>
          <span v-if="fieldErrors.reservedGiB" id="drive-reserved-error" class="mt-1 block text-xs font-normal text-red-500" role="alert">
            {{ fieldErrors.reservedGiB }}
          </span>
        </label>

        <label class="text-sm font-medium" for="drive-max-upload-gib">
          Tamanho máximo por arquivo (GiB)
          <input
            id="drive-max-upload-gib"
            v-model="fields.maxUploadGiB"
            type="number"
            min="0.01"
            step="0.01"
            inputmode="decimal"
            class="mt-2 min-h-11 w-full rounded-md border border-border bg-canvas px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            :aria-invalid="Boolean(fieldErrors.maxUploadGiB)"
            aria-describedby="drive-upload-help drive-upload-error"
          />
          <span id="drive-upload-help" class="mt-1 block text-xs font-normal text-muted">
            Deve respeitar a cota e o limite da instalação.
          </span>
          <span v-if="fieldErrors.maxUploadGiB" id="drive-upload-error" class="mt-1 block text-xs font-normal text-red-500" role="alert">
            {{ fieldErrors.maxUploadGiB }}
          </span>
        </label>

        <div class="sm:col-span-2 flex flex-wrap items-center justify-between gap-3">
          <p class="text-xs text-muted">
            Alterar a cota não remove arquivos existentes e não exige reiniciar o servidor.
          </p>
          <AppButton type="submit" :loading="saving">
            <Save :size="16" aria-hidden="true" />Salvar configurações
          </AppButton>
        </div>
      </form>
    </template>

    <p v-if="notice" class="mt-4 rounded-md border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-600" role="status" aria-live="polite">
      {{ notice }}
    </p>
    <p v-if="error" class="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500" role="alert">
      {{ error }}
    </p>
  </section>
</template>
