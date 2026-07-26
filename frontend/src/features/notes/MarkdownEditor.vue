<script setup>
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, LanguageDescription, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { EditorView, minimalSetup } from 'codemirror';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  ariaLabel: { type: String, default: 'Editor Markdown' }
});
const emit = defineEmits(['update:modelValue', 'save', 'contextmenu', 'selection-change']);

const host = ref(null);
let view;
let applyingExternalValue = false;
let lastSelectionState = false;

const codeLanguages = [
  LanguageDescription.of({ name: 'JavaScript', alias: ['js', 'javascript', 'jsx'], support: javascript({ jsx: true }) }),
  LanguageDescription.of({ name: 'TypeScript', alias: ['ts', 'typescript', 'tsx'], support: javascript({ jsx: true, typescript: true }) }),
  LanguageDescription.of({ name: 'HTML', alias: ['html', 'xml', 'vue'], support: html() }),
  LanguageDescription.of({ name: 'CSS', alias: ['css'], support: css() })
];

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'rgb(var(--color-canvas))',
    color: 'rgb(var(--color-foreground))',
    fontSize: '14px'
  },
  '.cm-content': {
    minHeight: '100%',
    padding: '16px',
    caretColor: 'rgb(var(--color-accent))',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    lineHeight: '1.65'
  },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-gutters': {
    backgroundColor: 'rgb(var(--color-surface))',
    color: 'rgb(var(--color-muted))',
    borderRight: '1px solid rgb(var(--color-border))'
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgb(var(--color-elevated) / .72)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'rgb(var(--selection)) !important' },
  '.cm-content ::selection': { backgroundColor: 'rgb(var(--selection)) !important' },
  '.cm-searchMatch': { backgroundColor: 'rgb(var(--color-accent) / .18)', outline: '1px solid rgb(var(--color-accent) / .55)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgb(var(--selection))' },
  '.cm-selectionMatch': { backgroundColor: 'transparent' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'rgb(var(--color-accent))' },
  '&.cm-focused': { outline: 'none' }
});

const highlightStyle = HighlightStyle.define([
  { tag: [tags.heading1, tags.heading2, tags.heading3, tags.heading4], color: 'rgb(var(--code-keyword))', fontWeight: '700' },
  { tag: [tags.keyword, tags.tagName, tags.bool, tags.null], color: 'rgb(var(--code-keyword))' },
  { tag: [tags.string, tags.special(tags.string), tags.link], color: 'rgb(var(--code-string))' },
  { tag: [tags.number, tags.atom], color: 'rgb(var(--code-number))' },
  { tag: [tags.propertyName, tags.attributeName, tags.variableName], color: 'rgb(var(--code-property))' },
  { tag: [tags.comment, tags.quote], color: 'rgb(var(--code-comment))', fontStyle: 'italic' },
  { tag: [tags.emphasis], fontStyle: 'italic' },
  { tag: [tags.strong], fontWeight: '700' },
  { tag: [tags.monospace], color: 'rgb(var(--code-string))' },
  { tag: [tags.punctuation, tags.meta], color: 'rgb(var(--color-muted))' }
]);

function currentSelection() {
  return view?.state.selection.main;
}

function notifySelection() {
  const selection = currentSelection();
  const hasSelection = Boolean(selection && !selection.empty);
  if (hasSelection === lastSelectionState) return;
  lastSelectionState = hasSelection;
  emit('selection-change', hasSelection);
}

function openContextMenu(x, y) {
  const selection = currentSelection();
  if (!selection || selection.empty) return false;
  emit('contextmenu', { x, y });
  return true;
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
  const endPosition = selection.to > selection.from ? selection.to - 1 : selection.to;
  const endLine = view.state.doc.lineAt(endPosition);
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

function handleShortcut(event) {
  if (event.shiftKey && event.key === 'F10') {
    const selection = currentSelection();
    if (!selection || selection.empty) return false;
    event.preventDefault();
    const coordinates = view.coordsAtPos(selection.head) ?? view.dom.getBoundingClientRect();
    openContextMenu(coordinates.left, coordinates.bottom ?? coordinates.top);
    return true;
  }
  if (!(event.ctrlKey || event.metaKey)) return false;
  const key = event.key.toLowerCase();
  if (key === 's') { event.preventDefault(); emit('save'); return true; }
  if (key === 'b') { event.preventDefault(); replaceSelection('**'); return true; }
  if (key === 'i') { event.preventDefault(); replaceSelection('*'); return true; }
  if (key === 'k') { event.preventDefault(); replaceSelection('[', '](https://)', 'texto do link'); return true; }
  return false;
}

function handleContextMenu(event) {
  if (!openContextMenu(event.clientX, event.clientY)) return false;
  event.preventDefault();
  return true;
}

onMounted(() => {
  view = new EditorView({
    parent: host.value,
    doc: props.modelValue,
    extensions: [
      minimalSetup,
      markdown({ codeLanguages }),
      syntaxHighlighting(highlightStyle),
      editorTheme,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': props.ariaLabel }),
      EditorView.domEventHandlers({ keydown: handleShortcut, contextmenu: handleContextMenu }),
      EditorView.updateListener.of((update) => {
        if (update.selectionSet) notifySelection();
        if (!update.docChanged || applyingExternalValue) return;
        emit('update:modelValue', update.state.doc.toString());
      })
    ]
  });
  notifySelection();
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
