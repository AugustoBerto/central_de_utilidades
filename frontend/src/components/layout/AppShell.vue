<script setup>
import {
  Activity,
  BookOpenText,
  FolderOpen,
  Gauge,
  Menu,
  Settings,
  TerminalSquare,
  X,
  Zap
} from 'lucide-vue-next';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import AppButton from '@/components/base/AppButton.vue';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();
const title = computed(() => route.meta.title ?? 'Painel de Utilidades');
const description = computed(() => route.meta.description ?? '');
const items = [
  { label: 'Visão geral', to: '/dashboard', icon: Gauge },
  { label: 'Notas rápidas', to: '/notes', icon: BookOpenText },
  { label: 'Drive pessoal', to: '/drive', icon: FolderOpen },
  { label: 'Atalhos', to: '/shortcuts', icon: Zap },
  { label: 'Automações', to: '/automations', icon: TerminalSquare }
];

function closeMobileNavigation() {
  ui.closeMobileNavigation();
}

async function logout() {
  await auth.logout();
  await router.replace({ name: 'login' });
}
</script>

<template>
  <div class="min-h-screen bg-canvas text-foreground">
    <button
      v-if="ui.mobileNavigationOpen"
      class="fixed inset-0 z-30 bg-black/60 lg:hidden"
      aria-label="Fechar navegação"
      @click="closeMobileNavigation"
    />
    <aside
      class="fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-surface transition-transform lg:translate-x-0"
      :class="[
        ui.mobileNavigationOpen ? 'translate-x-0' : '-translate-x-full',
        ui.sidebarCollapsed ? 'lg:w-20' : 'lg:w-72'
      ]"
      aria-label="Navegação principal"
    >
      <div class="flex h-16 items-center justify-between border-b border-border px-4">
        <RouterLink
          to="/dashboard"
          class="flex min-w-0 items-center gap-3 font-semibold text-foreground"
          @click="closeMobileNavigation"
        >
          <span class="rounded-md border border-border bg-elevated p-2 text-accent"
            ><Activity :size="18" aria-hidden="true"
          /></span>
          <span v-if="!ui.sidebarCollapsed" class="truncate">Utilidades</span>
        </RouterLink>
        <button
          class="rounded-md p-2 text-muted hover:bg-elevated hover:text-foreground lg:hidden"
          aria-label="Fechar navegação"
          @click="closeMobileNavigation"
        >
          <X :size="18" aria-hidden="true" />
        </button>
      </div>
      <nav class="flex-1 space-y-1 p-3">
        <RouterLink
          v-for="item in items"
          :key="item.to"
          :to="item.to"
          class="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-muted transition-colors hover:bg-elevated hover:text-foreground"
          :class="{ 'pointer-events-none opacity-45': item.disabled }"
          active-class="bg-elevated text-foreground"
          :aria-disabled="item.disabled || undefined"
          @click="closeMobileNavigation"
        >
          <component :is="item.icon" :size="18" aria-hidden="true" />
          <span v-if="!ui.sidebarCollapsed">{{ item.label }}</span>
        </RouterLink>
      </nav>
      <div class="border-t border-border p-3">
        <RouterLink
          to="/settings"
          class="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-muted hover:bg-elevated hover:text-foreground"
          active-class="bg-elevated text-foreground"
          @click="closeMobileNavigation"
        >
          <Settings :size="18" aria-hidden="true" />
          <span v-if="!ui.sidebarCollapsed">Preferências</span>
        </RouterLink>
      </div>
    </aside>

    <div
      class="min-h-screen transition-[padding] lg:pl-72"
      :class="{ 'lg:pl-20': ui.sidebarCollapsed }"
    >
      <header
        class="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-border bg-canvas/95 px-4 backdrop-blur sm:px-6"
      >
        <div class="flex min-w-0 items-center gap-3">
          <button
            class="rounded-md p-2 text-muted hover:bg-elevated hover:text-foreground lg:hidden"
            type="button"
            aria-label="Abrir navegação"
            @click="ui.openMobileNavigation"
          >
            <Menu :size="20" aria-hidden="true" />
          </button>
          <div class="min-w-0">
            <h1 class="truncate text-lg font-semibold">{{ title }}</h1>
            <p v-if="description" class="hidden truncate text-sm text-muted sm:block">
              {{ description }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span class="hidden text-sm text-muted sm:inline">{{
            auth.user?.username
          }}</span>
          <AppButton variant="secondary" @click="logout">Sair</AppButton>
        </div>
      </header>
      <main class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><slot /></main>
      <footer
        class="border-t border-border px-4 py-3 text-xs text-muted sm:px-6 lg:px-8"
      >
        <span class="inline-flex items-center gap-2"
          ><span class="size-2 rounded-full bg-green-400" aria-hidden="true" />Sessão
          autenticada — monitoramento disponível no dashboard.</span
        >
      </footer>
    </div>
  </div>
</template>
