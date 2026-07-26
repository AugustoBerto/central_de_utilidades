import { reactive, readonly } from 'vue';

const state = reactive({
  open: false,
  title: '',
  message: '',
  confirmLabel: 'Confirmar',
  cancelLabel: 'Cancelar',
  variant: 'default'
});

let pending = null;

function finish(value) {
  if (!state.open) return;
  const callback = pending;
  pending = null;
  state.open = false;
  callback?.(value);
}

export function requestConfirm(options = {}) {
  if (pending) pending(false);
  Object.assign(state, {
    open: true,
    title: options.title ?? 'Confirmar ação',
    message: options.message ?? '',
    confirmLabel: options.confirmLabel ?? 'Confirmar',
    cancelLabel: options.cancelLabel ?? 'Cancelar',
    variant: options.variant ?? 'default'
  });
  return new Promise((done) => {
    pending = done;
  });
}

export function useConfirm() {
  return { confirm: requestConfirm };
}

export function useConfirmDialog() {
  return {
    state: readonly(state),
    accept: () => finish(true),
    cancel: () => finish(false)
  };
}
