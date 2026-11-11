import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { registerConfirmHost, type ConfirmOptions } from "@/lib/confirmAction";

interface Pending {
  message: string;
  options: ConfirmOptions;
  resolve: (approved: boolean) => void;
}

/** Mount once near the app root. Shows one confirmation at a time, in order. */
export function ConfirmHost() {
  const [current, setCurrent] = useState<Pending | null>(null);
  const queue = useRef<Pending[]>([]);
  const active = useRef<Pending | null>(null);
  // Radix closes the dialog through onOpenChange for every route (Cancel,
  // Escape, outside click and the confirm button). The confirm button sets
  // this flag first, so each prompt is settled exactly once.
  const approved = useRef(false);

  const showNext = useCallback(() => {
    const next = queue.current.shift() ?? null;
    active.current = next;
    setCurrent(next);
  }, []);

  useEffect(() => registerConfirmHost((message, options) => new Promise<boolean>(resolve => {
    queue.current.push({ message, options, resolve });
    if (!active.current) showNext();
  })), [showNext]);

  const settle = () => {
    const decision = approved.current;
    approved.current = false;
    active.current?.resolve(decision);
    showNext();
  };

  const options = current?.options ?? {};
  return (
    <AlertDialog open={current !== null} onOpenChange={open => { if (!open && active.current) settle(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options.title ?? "Please confirm"}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">{current?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{options.cancelLabel ?? "Cancel"}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { approved.current = true; }}
            className={options.danger ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
          >{options.confirmLabel ?? "Confirm"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
