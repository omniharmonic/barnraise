"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  /** The trigger element (e.g. a Button). */
  children: React.ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * Accessible confirmation modal (focus-trapped, Esc to close, labelled)
 * replacing window.confirm() for destructive actions.
 */
export function ConfirmDialog({
  children,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-walnut/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-earth bg-cream-light p-6 shadow-xl focus:outline-none">
          <Dialog.Title className="text-lg font-display text-walnut">
            {title}
          </Dialog.Title>
          {description && (
            <Dialog.Description className="mt-2 text-sm text-walnut-muted">
              {description}
            </Dialog.Description>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <Dialog.Close asChild>
              <Button variant="outline">{cancelLabel}</Button>
            </Dialog.Close>
            <Button
              variant={destructive ? "destructive" : "default"}
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
