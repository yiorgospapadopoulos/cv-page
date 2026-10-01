// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindDialog } from './dialog';

function setup(withClose = true) {
  document.body.innerHTML = `
    <button id="trigger">[more]</button>
    <dialog id="dialog">
      ${withClose ? '<button id="close" data-dialog-close>Close</button>' : ''}
      <p id="text">Hello</p>
    </dialog>`;
  const trigger = document.getElementById('trigger') as HTMLButtonElement;
  const dialog = document.getElementById('dialog') as HTMLDialogElement;
  dialog.showModal = vi.fn(() => {
    dialog.setAttribute('open', '');
  });
  dialog.close = vi.fn(() => {
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
  });
  return { trigger, dialog };
}

function backdropClick(dialog: HTMLDialogElement, x: number, y: number) {
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    right: 400,
    top: 100,
    bottom: 400,
    width: 300,
    height: 300,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  });
  dialog.dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }),
  );
}

describe('bindDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens modally and focuses the close button on trigger click', () => {
    const { trigger, dialog } = setup();
    bindDialog(trigger, dialog);
    trigger.click();
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).toBe('close');
  });

  it('focuses the dialog itself when it has no close button', () => {
    const { trigger, dialog } = setup(false);
    bindDialog(trigger, dialog);
    trigger.click();
    expect(document.activeElement).toBe(dialog);
  });

  it('closes when the close button is clicked', () => {
    const { trigger, dialog } = setup();
    bindDialog(trigger, dialog);
    trigger.click();
    (document.getElementById('close') as HTMLElement).click();
    expect(dialog.close).toHaveBeenCalledTimes(1);
  });

  it('does not close when other content inside the dialog is clicked', () => {
    const { trigger, dialog } = setup();
    bindDialog(trigger, dialog);
    trigger.click();
    (document.getElementById('text') as HTMLElement).click();
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it('closes on a backdrop click outside the dialog box', () => {
    const { trigger, dialog } = setup();
    bindDialog(trigger, dialog);
    trigger.click();
    backdropClick(dialog, 50, 200);
    expect(dialog.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    [450, 200],
    [200, 50],
    [200, 450],
  ])('closes on a backdrop click at %i,%i', (x, y) => {
    const { trigger, dialog } = setup();
    bindDialog(trigger, dialog);
    trigger.click();
    backdropClick(dialog, x, y);
    expect(dialog.close).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog open when the click lands inside its box', () => {
    const { trigger, dialog } = setup();
    bindDialog(trigger, dialog);
    trigger.click();
    backdropClick(dialog, 200, 200);
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it('returns focus to the trigger when the dialog closes', () => {
    const { trigger, dialog } = setup();
    bindDialog(trigger, dialog);
    trigger.click();
    dialog.dispatchEvent(new Event('close'));
    expect(document.activeElement).toBe(trigger);
  });

  it('removes every listener on cleanup', () => {
    const { trigger, dialog } = setup();
    const cleanup = bindDialog(trigger, dialog);
    cleanup();
    trigger.click();
    (document.getElementById('close') as HTMLElement).click();
    backdropClick(dialog, 50, 200);
    dialog.dispatchEvent(new Event('close'));
    expect(dialog.showModal).not.toHaveBeenCalled();
    expect(dialog.close).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(trigger);
  });
});
