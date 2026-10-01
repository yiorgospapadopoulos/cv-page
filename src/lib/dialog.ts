export function bindDialog(
  trigger: HTMLElement,
  dialog: HTMLDialogElement,
): () => void {
  const open = () => {
    dialog.showModal();
    const closeButton = dialog.querySelector<HTMLElement>(
      '[data-dialog-close]',
    );
    (closeButton ?? dialog).focus();
  };

  const onDialogClick = (event: MouseEvent) => {
    const target = event.target as Element;
    if (target.closest('[data-dialog-close]')) {
      dialog.close();
      return;
    }
    if (target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!inside) dialog.close();
  };

  const restoreFocus = () => trigger.focus();

  trigger.addEventListener('click', open);
  dialog.addEventListener('click', onDialogClick);
  dialog.addEventListener('close', restoreFocus);

  return () => {
    trigger.removeEventListener('click', open);
    dialog.removeEventListener('click', onDialogClick);
    dialog.removeEventListener('close', restoreFocus);
  };
}
