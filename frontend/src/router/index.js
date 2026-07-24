import { createRouter, createWebHistory } from 'vue-router';

import AppShell from '@/components/layout/AppShell.vue';
import { useAuthStore } from '@/stores/auth';
import AutomationsView from '@/views/AutomationsView.vue';
import DashboardView from '@/views/DashboardView.vue';
import DriveView from '@/views/DriveView.vue';
import LoginView from '@/views/LoginView.vue';
import NotFoundView from '@/views/NotFoundView.vue';
import NotesView from '@/views/NotesView.vue';
import SettingsView from '@/views/SettingsView.vue';
import ShortcutsView from '@/views/ShortcutsView.vue';

export const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/login', name: 'login', component: LoginView, meta: { title: 'Entrar' } },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: DashboardView,
    meta: {
      layout: AppShell,
      title: 'Visão geral',
      description: 'Acompanhe métricas da origem configurada.',
      requiresAuth: true
    }
  },
  {
    path: '/notes',
    name: 'notes',
    component: NotesView,
    meta: {
      layout: AppShell,
      title: 'Notas rápidas',
      description: 'Capture e recupere contexto operacional.',
      requiresAuth: true
    }
  },
  {
    path: '/drive',
    name: 'drive',
    component: DriveView,
    meta: {
      layout: AppShell,
      title: 'Drive pessoal',
      description: 'Envie e recupere arquivos de trabalho.',
      requiresAuth: true
    }
  },
  {
    path: '/shortcuts',
    name: 'shortcuts',
    component: ShortcutsView,
    meta: {
      layout: AppShell,
      title: 'Atalhos',
      description: 'Gerencie acessos frequentes.',
      requiresAuth: true
    }
  },
  {
    path: '/automations',
    name: 'automations',
    component: AutomationsView,
    meta: {
      layout: AppShell,
      title: 'Automações',
      description: 'Execute somente rotinas autorizadas.',
      requiresAuth: true
    }
  },
  {
    path: '/settings',
    name: 'settings',
    component: SettingsView,
    meta: {
      layout: AppShell,
      title: 'Preferências',
      description: 'Gerencie os navegadores com acesso ao painel.',
      requiresAuth: true
    }
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.restore();
  if (to.name === 'automations' && !auth.automationsEnabled)
    return { name: 'dashboard', query: { notice: 'automations-disabled' } };
  if (to.meta.requiresAuth && !auth.authenticated)
    return { name: 'login', query: { reason: 'session' } };
  if (to.name === 'login' && auth.authenticated) return { name: 'dashboard' };
  return true;
});

export default router;
