/**
 * Promise-based replacement for window.confirm.
 *
 * The browser's native confirm() is blocked or silently suppressed in some
 * embedded browsers and installed PWAs, cannot be styled, and is unreadable
 * for long financial warnings. ConfirmHost (mounted once at the app root)
 * shows an accessible dialog instead. When no host is mounted (unit tests,
 * isolated renders) this falls back to window.confirm so behaviour never
 * silently approves an action.
 */
export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive (refunds, removals, closures). */
  danger?: boolean;
}

type Ask = (message: string, options: ConfirmOptions) => Promise<boolean>;

let host: Ask | null = null;

/** Called by ConfirmHost on mount; returns the cleanup that unregisters it. */
export function registerConfirmHost(ask: Ask): () => void {
  host = ask;
  return () => {
    if (host === ask) host = null;
  };
}

export function confirmAction(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (host) return host(message, options);
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    return Promise.resolve(window.confirm(message));
  }
  // No way to ask the person: never approve a money-affecting action unseen.
  return Promise.resolve(false);
}
