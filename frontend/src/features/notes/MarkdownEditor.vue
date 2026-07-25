<script setup>
import { markdown } from '@codemirror/lang-markdown';
import { basicSetup, EditorView } from 'codemirror';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  ariaLabel: { type: String, default: 'Editor Markdown' }
});
const emit = defineEmits(['update:modelValue', 'save']);

const host = ref(null);
let view;
let applyingExternalValue = false;

const theme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: '#0d1117',
    color: '#e6edf3',
    fontSize: '14px'
  },
  '.cm-content': {
    minHeight: '100%',
    padding: '16px',
    caretColor: '#58a6ff',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    lineHeight: '1.65'
  },
  '.cm-scroller': {
    overflow: 'auto'
  },
  '.cm-gutters': {
    backgroundColor: '#161b22',
    color: '#6e7681',
    borderRight: '1px solid #30363d'
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: '#161b22'
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: '#264f78 !important'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#58a6ff'
  },
  '.cm-focused': {
    outline: 'none'
  }
}, { dark: true });

function currentSelection() {
  return view?.state.selection.main;
}

function replaceSelection(before, after = before, placeholder = 'texto') {
  if (!view) return;
  const selection = currentSelection();
  const selectedText = view.state.sliceDoc(selection.from, selection.to) || placeholder;
  const insertion = `${before}${selectedText}${after}`;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: insertion },
    selection: { anchor: selection.from + before.length, head: selection.from + before.length + selectedText.length }
  });
  view.focus();
}

function prefixLines(prefix) {
  if (!view) return;
  const selection = currentSelection();
  const startLine = view.state.doc.lineAt(selection.from);
  const endLine = view.state.doc.lineAt(selection.to);
  const original = view.state.sliceDoc(startLine.from, endLine.to);
  const replacement = original.split('\n').map((line) => `${prefix}${line}`).join('\n');
  view.dispatch({
    changes: { from: startLine.from, to: endLine.to, insert: replacement },
    selection: { anchor: startLine.from, head: startLine.from + replacement.length }
  });
  view.focus();
}

function focus() {
  view?.focus();
}

onMounted(() => {
  view = new EditorView({
    parent: host.value,
    doc: props.modelValue,
    extensions: [
      basicSetup,
      markdown(),
      theme,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': props.ariaLabel }),
      EditorView.domEventHandlers({
        keydown(event) {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            emit('save');
            return true;
          }
          return false;
        }
      }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || applyingExternalValue) return;
        emit('update:modelValue', update.state.doc.toString());
      })
    ]
  });
});

watch(() => props.modelValue, (value) => {
  if (!view || value === view.state.doc.toString()) return;
  applyingExternalValue = true;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  applyingExternalValue = false;
});

onBeforeUnmount(() => view?.destroy());

defineExpose({ focus, prefixLines, replaceSelection });
</script>

<template>
  <div ref="host" class="h-full min-h-0 overflow-hidden rounded-lg border border-border bg-canvas focus-within:border-accent" />
</template>
