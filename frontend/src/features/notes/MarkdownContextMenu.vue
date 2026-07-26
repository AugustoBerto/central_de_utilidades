<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  x: { type: Number, required: true },
  y: { type: Number, required: true }
});
const emit = defineEmits(['action', 'close']);

const menu = ref(null);
const left = ref(props.x);
const top = ref(props.y);
const codeLanguage = ref('bash');

const actions = [
  ['heading', 'Título'],
  ['bold', 'Negrito'],
  ['italic', 'Itálico'],
  ['underline', 'Sublinhado'],
  ['strike', 'Tachado'],
  ['bullet-list', 'Lista'],
  ['numbered-list', 'Lista numerada'],
  ['quote', 'Citação'],
  ['inline-code', 'Código inline'],
  ['link', 'Link']
];

function choose(action, payload) {
  emit('action', { action, payload });
}

function closeOnOutside(event) {
  if (!menu.value?.contains(event.target)) emit('close');
}

function onKeydown(event) {
  if (event.key === 'Escape') emit('close');
}

onMounted(async () => {
  window.addEventListener('pointerdown', closeOnOutside, true);
  window.addEventListener('resize', () => emit('close'), { once: true });
  window.addEventListener('scroll', () => emit('close'), { once: true, capture: true });
  window.addEventListener('keydown', onKeydown);
  await nextTick();
  const rect = menu.value?.getBoundingClientRect();
  if (!rect) return;
  left.value = Math.max(8, Math.min(props.x, window.innerWidth - rect.width - 8));
  top.value = Math.max(8, Math.min(props.y, window.innerHeight - rect.height - 8));
  menu.value.querySelector('button')?.focus();
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', closeOnOutside, true);
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      ref="menu"
      class="fixed z-[80] w-64 overflow-hidden rounded-lg border border-border bg-surface p-2 shadow-xl"
      :style="{ left: `${left}px`, top: `${top}px` }"
      role="menu"
      aria-label="Formatar texto selecionado"
      @contextmenu.prevent
    >
      <p class="px-2 pb-2 text-xs font-medium text-muted">Formatar seleção</p>
      <div class="grid grid-cols-2 gap-1">
        <button
          v-for="[action, label] in actions"
          :key="action"
          type="button"
          class="rounded-md px-2 py-2 text-left text-xs text-foreground hover:bg-elevated focus:bg-elevated"
          role="menuitem"
          @click="choose(action)"
        >
          {{ label }}
        </button>
      </div>
      <div class="mt-2 border-t border-border pt-2">
        <label class="block px-2 text-xs text-muted" for="context-code-language">Bloco de código</label>
        <div class="mt-1 flex gap-1">
          <select id="context-code-language" v-model="codeLanguage" class="min-h-9 min-w-0 flex-1 rounded-md border border-border bg-canvas px-2 text-xs">
            <option value="text">Texto</option>
            <option value="bash">Bash</option>
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="json">JSON</option>
            <option value="html">HTML</option>
            <option value="css">CSS</option>
            <option value="vue">Vue</option>
            <option value="sql">SQL</option>
            <option value="yaml">YAML</option>
            <option value="dockerfile">Dockerfile</option>
            <option value="nginx">Nginx</option>
          </select>
          <button type="button" class="rounded-md border border-border bg-elevated px-3 text-xs hover:bg-border" @click="choose('code-block', codeLanguage)">Aplicar</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
