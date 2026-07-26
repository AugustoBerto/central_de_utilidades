<script setup>
import { AlertTriangle } from 'lucide-vue-next';
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

import AppButton from '@/components/base/AppButton.vue';
import { useConfirmDialog } from '@/composables/useConfirm';

const { state, accept, cancel } = useConfirmDialog();
const cancelButton = ref(null);

function onKeydown(event) {
  if (!state.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    cancel();
  }
}

watch(() => state.open, (open) => {
  if (open) nextTick(() => cancelButton.value?.$el?.focus?.());
});

window.addEventListener('keydown', onKeydown);
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="state.open" class="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="presentation">
      <section class="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl" role="alertdialog" aria-modal="true" :aria-label="state.title">
        <div class="flex gap-4">
          <span
            class="mt-0.5 flex size-12 shrink-0 self-start items-center justify-center rounded-lg border border-border bg-elevated"
            :class="state.variant === 'danger' ? 'text-red-500' : 'text-accent'"
          >
            <AlertTriangle :size="22" aria-hidden="true" />
          </span>
          <div class="min-w-0 flex-1">
            <h2 class="text-lg font-semibold">{{ state.title }}</h2>
            <p class="mt-2 text-sm leading-6 text-muted">{{ state.message }}</p>
          </div>
        </div>
        <div class="mt-6 flex flex-wrap justify-end gap-3">
          <AppButton ref="cancelButton" variant="secondary" @click="cancel">{{ state.cancelLabel }}</AppButton>
          <AppButton :variant="state.variant === 'danger' ? 'danger' : 'primary'" @click="accept">{{ state.confirmLabel }}</AppButton>
        </div>
      </section>
    </div>
  </Teleport>
</template>
