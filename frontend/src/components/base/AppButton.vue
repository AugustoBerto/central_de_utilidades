<script setup>
defineProps({
  type: { type: String, default: 'button' },
  variant: { type: String, default: 'primary' },
  loading: { type: Boolean, default: false }
});
</script>

<template>
  <button
    :type="type"
    :disabled="loading"
    class="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    :class="
      variant === 'primary'
        ? 'border-accent bg-accent text-white hover:bg-blue-500'
        : variant === 'danger'
          ? 'app-button-danger'
          : 'border-border bg-elevated text-foreground hover:bg-border'
    "
  >
    <span
      v-if="loading"
      class="size-3 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
