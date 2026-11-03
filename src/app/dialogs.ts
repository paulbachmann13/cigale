import { fmt, t } from '../i18n/fr';
import { clear, h } from './dom';

function modal(build: (close: () => void) => Node[], onClose?: () => void): HTMLDialogElement {
  const dlg = h('dialog', { class: 'modal' });
  const close = () => dlg.close();
  dlg.append(...build(close));
  dlg.addEventListener('close', () => {
    dlg.remove();
    onClose?.();
  });
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

export function showMessage(title: string, message: string, id = 'dialog-message'): Promise<void> {
  return new Promise((resolve) => {
    modal(
      (close) => [
        h('h2', {}, title),
        h('p', { class: 'dialog-text' }, message),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'primary', autofocus: true, onclick: close }, t.errors.ok)),
      ],
      resolve,
    ).id = id;
  });
}

/** Demande un mot de passe ; renvoie null si l'utilisateur annule. */
export function askPassword(name: string, incorrect: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    let answer: string | null = null;
    const input = h('input', { type: 'password', id: 'password-input', autocomplete: 'off', 'aria-label': t.password.label });
    const form = h(
      'form',
      { method: 'dialog' },
      h('h2', {}, t.password.title),
      h('p', { class: 'dialog-text' }, fmt(t.password.message, { name })),
      incorrect ? h('p', { class: 'dialog-error', role: 'alert' }, t.password.wrong) : null,
      input,
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { type: 'button', id: 'password-cancel', onclick: () => dlg.close() }, t.password.cancel),
        h('button', { type: 'submit', class: 'primary', id: 'password-ok' }, t.password.ok),
      ),
    );
    form.addEventListener('submit', () => {
      answer = input.value;
    });
    const dlg = modal(() => [form], () => resolve(answer));
    dlg.id = 'dialog-password';
    input.focus();
  });
}

export function showCustom(title: string, body: Node, closeLabel: string, id: string): void {
  const dlg = modal((close) => [
    h('h2', {}, title),
    body,
    h('div', { class: 'dialog-actions' }, h('button', { class: 'primary', onclick: close }, closeLabel)),
  ]);
  dlg.id = id;
}

export { clear };
