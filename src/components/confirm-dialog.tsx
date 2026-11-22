import { createSignal, type JSX } from "solid-js";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { m } from "~/paraglide/messages";

/**
 * A button that asks before it acts:
 *   <ConfirmButton label="Löschen" question="Wirklich löschen?" onConfirm={…} destructive />
 */
export function ConfirmButton(props: {
  label: string;
  question: string;
  confirmLabel?: string;
  onConfirm: () => unknown;
  destructive?: boolean;
  size?: "sm" | "default";
  variant?: "outline" | "ghost" | "destructive";
  ariaLabel?: string;
  children?: JSX.Element;
}) {
  const [open, setOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  async function confirm() {
    setBusy(true);
    try {
      await props.onConfirm();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }
  return (
    <>
      <Button
        variant={props.variant ?? "outline"}
        size={props.size ?? "sm"}
        aria-label={props.ariaLabel}
        onClick={() => setOpen(true)}
      >
        {props.children ?? props.label}
      </Button>
      <Dialog open={open()} onOpenChange={setOpen}>
        <DialogContent role="alertdialog">
          <DialogHeader>
            <DialogTitle>{props.label}</DialogTitle>
            <DialogDescription>{props.question}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {m.common_cancel()}
            </Button>
            <Button
              variant={props.destructive ? "destructive" : "default"}
              disabled={busy()}
              onClick={confirm}
            >
              {props.confirmLabel ?? props.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
