<script setup>
import { X } from 'lucide-vue-next';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import AppButton from '@/components/base/AppButton.vue';

const props = defineProps({
  title: { type: String, default: '' },
  ariaLabel: { type: String, default: '' },
  maxWidthClass: { type: String, default: 'max-w-3xl' },
  closeOnEscape: { type: Boolean, default: true }
});
const emit = defineEmits(['close']);

const closeButton = ref(null);
const pointerStartedOnBackdrop = ref(false);
const previouslyFocused = document.activeElement;
const previousOverflow = document.body.style.overflow;

function close() {
  emit('close');
}

function onBackdropPointerDown(event) {
  pointerStartedOnBackdrop.value = event.target === event.currentTarget;
}

function onBackdropPointerUp(event) {
  const shouldClose = pointerStartedOnBackdrop.value && event.target === event.currentTarget;
  pointerStartedOnBackdrop.value = false;
  if (shouldClose) close();
}

function onKeydown(event) {
  if (props.closeOnEscape && event.key === 'Escape') close();
}

onMounted(() => {
  document.body.style.overflow = 'hidden';
  window.addEventListener('keydown', onKeydown);
  nextTick(() => closeButton.value?.$el?.focus?.());
});

onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow;
  window.removeEventListener('keydown', onKeydown);
  requestAnimationFrame(() => previouslyFocused?.focus?.());
});
</script>

<template>
  <div
    class="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
    @pointerdown="onBackdropPointerDown"
    @pointerup="onBackdropPointerUp"
    @pointercancel="pointerStartedOnBackdrop = false"
  >
    <section
      class="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      :class="maxWidthClass"
      role="dialog"
      aria-modal="true"
      :aria-label="ariaLabel || title"
    >
      <header class="flex shrink-0 items-start justify-between gap-4 border-b border-border bg-surface/95 px-5 py-4 backdrop-blur sm:px-6">
        <div class="min-w-0 flex-1">
          <slot name="header">
            <h2 class="truncate text-lg font-semibold tracking-tight">{{ title }}</h2>
          </slot>
        </div>
        <AppButton ref="closeButton" variant="secondary" title="Fechar" @click="close">
          <X :size="18" aria-hidden="true" />
          <span class="sr-only">Fechar</span>
        </AppButton>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <slot />
      </div>

      <footer v-if="$slots.footer" class="shrink-0 border-t border-border bg-surface px-5 py-4 sm:px-6">
        <slot name="footer" />
      </footer>
    </section>
  </div>
</template>
