import { computed, ref } from 'vue';

const STORAGE_KEY = 'app-theme';
const preference = ref(localStorage.getItem(STORAGE_KEY) || 'system');
const systemDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches);
const media = window.matchMedia('(prefers-color-scheme: dark)');

const resolvedTheme = computed(() => preference.value === 'system' ? (systemDark.value ? 'dark' : 'light') : preference.value);

function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme.value;
  document.documentElement.style.colorScheme = resolvedTheme.value;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolvedTheme.value === 'dark' ? '#0d1117' : '#f6f8fa');
  window.dispatchEvent(new CustomEvent('app:theme-changed', { detail: resolvedTheme.value }));
}

function setTheme(value) {
  if (!['light', 'dark', 'system'].includes(value)) return;
  preference.value = value;
  localStorage.setItem(STORAGE_KEY, value);
  applyTheme();
}

media.addEventListener('change', (event) => {
  systemDark.value = event.matches;
  if (preference.value === 'system') applyTheme();
});

applyTheme();

export function useTheme() {
  return { preference, resolvedTheme, setTheme };
}
