// Android's Back button should close the dialog on top before it does anything else,
// and closing must never lose data. Open dialogs register a handler here while they
// are showing; NativeBridge asks this stack first and only navigates when it is empty.
import { useEffect, useRef } from "react";

const handlers: Array<() => void> = [];

/** Register a "close me" handler. Returns a function that removes it. */
export function pushBackHandler(handler: () => void): () => void {
  handlers.push(handler);
  return () => {
    const i = handlers.lastIndexOf(handler);
    if (i >= 0) handlers.splice(i, 1);
  };
}

/** Run the top handler (the newest open dialog). True if one handled the press. */
export function runBackHandler(): boolean {
  const top = handlers[handlers.length - 1];
  if (!top) return false;
  top();
  return true;
}

/** While `open`, Android Back calls `onClose` instead of leaving the screen. */
export function useBackToClose(open: boolean, onClose: () => void) {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    if (!open) return;
    return pushBackHandler(() => latest.current());
  }, [open]);
}
