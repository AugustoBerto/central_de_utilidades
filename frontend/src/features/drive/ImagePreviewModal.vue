<script setup>
import { Download, X } from 'lucide-vue-next';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import AppButton from '@/components/base/AppButton.vue';
import { formatBytes } from '@/features/dashboard/format';

defineProps({
  file: {
    type: Object,
    required: true
  }
});
const emit = defineEmits(['close']);

const closeButton = ref(null);
const imageLoading = ref(true);
const imageError = ref(false);

function close() {
  emit('close');
}

function onKeydown(event) {
  if (event.key === 'Escape') close();
}

function onImageLoad() {
  imageLoading.value = false;
  imageError.value = false;
}

function onImageError() {
  imageLoading.value = false;
  imageError.value = true;
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  nextTick(() => closeButton.value?.$el?.focus?.());
});

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex flex-col bg-black/90"
    role="dialog"
    aria-modal="true"
    :aria-label="`Visualização de ${file.originalName}`"
    @click.self="close"
  >
    <header class="flex min-h-16 items-center gap-3 border-b border-white/10 bg-black/40 px-4 sm:px-6">
      <div class="min-w-0 flex-1">
        <h2 class="truncate font-semibold text-white">{{ file.originalName }}</h2>
        <p class="mt-0.5 text-xs text-white/60">{{ formatBytes(file.sizeBytes) }}</p>
      </div>
      <a
        :href="`/api/files/${file.id}/download`"
        class="inline-flex min-h-10 items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 text-sm font-medium text-white hover:bg-white/20"
      >
        <Download :size="16" aria-hidden="true" />
        <span class="hidden sm:inline">Baixar</span>
      </a>
      <AppButton ref="closeButton" variant="secondary" title="Fechar visualização" @click="close">
        <X :size="18" aria-hidden="true" />
        <span class="sr-only">Fechar visualização</span>
      </AppButton>
    </header>

    <div class="relative flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8" @click.self="close">
      <p v-if="imageLoading" class="absolute text-sm text-white/70" role="status">
        Carregando imagem…
      </p>
      <div
        v-if="imageError"
        class="rounded-lg border border-red-400/40 bg-red-500/10 p-5 text-center text-sm text-red-100"
        role="alert"
      >
        Não foi possível carregar a visualização desta imagem.
      </div>
      <img
        v-show="!imageError"
        :src="`/api/files/${file.id}/preview`"
        :alt="file.originalName"
        class="max-h-full max-w-full object-contain shadow-2xl"
        @load="onImageLoad"
        @error="onImageError"
      />
    </div>
  </div>
</template>
