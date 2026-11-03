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

/** Question à deux réponses. Renvoie true si l'utilisateur accepte. */
export function confirmDialog(title: string, message: string, okLabel: string, cancelLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    let ok = false;
    const dlg = modal(
      (close) => [
        h('h2', {}, title),
        h('p', { class: 'dialog-text' }, message),
        h(
          'div',
          { class: 'dialog-actions' },
          h('button', { id: 'confirm-cancel', onclick: close }, cancelLabel),
          h('button', { id: 'confirm-ok', class: 'primary', onclick: () => ((ok = true), close()) }, okLabel),
        ),
      ],
      () => resolve(ok),
    );
    dlg.id = 'dialog-confirm';
  });
}

/** « Enregistrer les modifications ? » : trois réponses. */
export function askUnsaved(name: string): Promise<'save' | 'discard' | 'cancel'> {
  return new Promise((resolve) => {
    let answer: 'save' | 'discard' | 'cancel' = 'cancel';
    const pick = (a: typeof answer, close: () => void) => () => ((answer = a), close());
    const dlg = modal(
      (close) => [
        h('h2', {}, t.confirm.unsavedTitle),
        h('p', { class: 'dialog-text' }, fmt(t.confirm.unsavedMessage, { name })),
        h(
          'div',
          { class: 'dialog-actions' },
          h('button', { id: 'unsaved-cancel', onclick: pick('cancel', close) }, t.confirm.cancel),
          h('button', { id: 'unsaved-discard', onclick: pick('discard', close) }, t.confirm.discard),
          h('button', { id: 'unsaved-save', class: 'primary', onclick: pick('save', close) }, t.confirm.save),
        ),
      ],
      () => resolve(answer),
    );
    dlg.id = 'dialog-unsaved';
  });
}

/** Demande un nombre entier entre min et max ; null si annulé. */
export function askNumber(title: string, label: string, min: number, max: number, initial: number, okLabel: string, cancelLabel: string): Promise<number | null> {
  return new Promise((resolve) => {
    let answer: number | null = null;
    const input = h('input', { type: 'number', id: 'number-input', min, max, value: initial, 'aria-label': label });
    const form = h(
      'form',
      { method: 'dialog' },
      h('h2', {}, title),
      h('label', { class: 'dialog-text' }, label, input),
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { type: 'button', id: 'number-cancel', onclick: () => dlg.close() }, cancelLabel),
        h('button', { type: 'submit', class: 'primary', id: 'number-ok' }, okLabel),
      ),
    );
    form.addEventListener('submit', () => {
      const n = Math.round(Number(input.value));
      answer = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
    });
    const dlg = modal(() => [form], () => resolve(answer));
    dlg.id = 'dialog-number';
    input.select();
  });
}

export { clear };
