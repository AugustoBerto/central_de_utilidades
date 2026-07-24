<script setup>
import { Construction, ExternalLink } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import AppButton from '@/components/base/AppButton.vue';

const route = useRoute();
const Layout = computed(() => route.meta.layout);
const title = computed(() => route.meta.title);
const description = computed(() => route.meta.description);
</script>

<template>
  <component :is="Layout">
    <section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div class="rounded-lg border border-border bg-surface p-6 sm:p-8">
        <div
          class="mb-8 flex size-11 items-center justify-center rounded-md border border-border bg-elevated text-accent"
        >
          <Construction :size="22" aria-hidden="true" />
        </div>
        <p class="text-sm font-medium text-accent">Fundação visual</p>
        <h2 class="mt-2 text-2xl font-semibold tracking-tight">{{ title }}</h2>
        <p class="mt-3 max-w-2xl text-muted">{{ description }}</p>
        <div class="mt-8 flex flex-wrap gap-3">
          <AppButton disabled>Funcionalidade planejada</AppButton>
          <RouterLink
            to="/login"
            class="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-elevated px-3 text-sm font-medium text-foreground hover:bg-border"
          >
            Ver entrada <ExternalLink :size="16" aria-hidden="true" />
          </RouterLink>
        </div>
      </div>
      <aside
        class="rounded-lg border border-border bg-surface p-5"
        aria-label="Estado do módulo"
      >
        <h3 class="font-medium">Estado atual</h3>
        <dl class="mt-4 space-y-4 text-sm">
          <div>
            <dt class="text-muted">Interface</dt>
            <dd class="mt-1 text-foreground">Shell e navegação disponíveis</dd>
          </div>
          <div>
            <dt class="text-muted">Dados</dt>
            <dd class="mt-1 text-foreground">Ainda não conectados</dd>
          </div>
          <div>
            <dt class="text-muted">Autenticação</dt>
            <dd class="mt-1 text-foreground">Sessão persistente disponível</dd>
          </div>
        </dl>
      </aside>
    </section>
  </component>
</template>
