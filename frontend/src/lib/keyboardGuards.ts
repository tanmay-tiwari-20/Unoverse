const INTERACTIVE = 'button, a[href], input, textarea, select, [contenteditable], [role="button"], [role="tab"], [role="slider"], [role="radio"], [role="switch"]';

/** Let dialogs and focused controls own their keys instead of playing a card. */
export function shouldIgnoreGameplayKey(event: KeyboardEvent, root: ParentNode = document): boolean {
  if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return true;
  if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return true;
  return Array.from(root.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'))
    .some((dialog) => dialog.getClientRects().length > 0);
}
