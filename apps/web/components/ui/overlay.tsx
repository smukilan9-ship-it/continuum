"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button, LoadingButton } from "./primitives";
import { useReturnFocus } from "./use-return-focus";
import { cn } from "./utils";

export type DialogSize = "sm" | "md" | "lg";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  dirty = false,
  dirtyMessage = "Discard the information you entered?",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  dirty?: boolean;
  dirtyMessage?: string;
}) {
  // The discard prompt is rendered in the dialog rather than raised as a native
  // `window.confirm`: native dialogs are unstyled, block the main thread, cannot
  // be tested, and are suppressed outright in some embedded contexts.
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const returnFocus = useReturnFocus(open);

  function requestClose() {
    if (!dirty) { onOpenChange(false); return; }
    setConfirmingDiscard(true);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (next) { setConfirmingDiscard(false); onOpenChange(true); } else requestClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="modal-backdrop" />
        <DialogPrimitive.Content
          className={cn("modal-content", `modal-${size}`)}
          onEscapeKeyDown={(event) => { if (dirty) { event.preventDefault(); requestClose(); } }}
          onPointerDownOutside={(event) => { if (dirty) event.preventDefault(); }}
          onCloseAutoFocus={returnFocus.onCloseAutoFocus}
        >
          <header className="modal-heading">
            <div>
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description>{description}</DialogPrimitive.Description> : null}
            </div>
            <button className="modal-close" type="button" aria-label={`Close ${title}`} onClick={requestClose}><X size={18} /></button>
          </header>
          {confirmingDiscard ? (
            <div className="modal-discard" role="alertdialog" aria-label={dirtyMessage}>
              <p>{dirtyMessage}</p>
              <div>
                <Button variant="secondary" onClick={() => setConfirmingDiscard(false)}>Keep editing</Button>
                <Button variant="danger" onClick={() => { setConfirmingDiscard(false); onOpenChange(false); }}>Discard</Button>
              </div>
            </div>
          ) : null}
          {children ? <div className="modal-body">{children}</div> : null}
          {footer ? <footer className="modal-footer">{footer}</footer> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  busy,
  destructive = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  destructive?: boolean;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton variant={destructive ? "danger" : "primary"} loading={busy} onClick={onConfirm}>{confirmLabel}</LoadingButton>
        </>
      }
    >
      {/* `description` is already rendered — and announced — by the modal
          header. Repeating it in the body printed the same sentence twice in a
          dialog whose whole job is one clear question. */}
      {null}
    </Modal>
  );
}

export function Popover({
  trigger,
  children,
  align = "start",
  className,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content className={cn("popover", className)} align={align} sideOffset={6} collisionPadding={12}>
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export type MenuItem = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  /** Shown when disabled — §15.8 forbids disabling an action without saying why. */
  disabledReason?: string;
};

/**
 * Overflow menu following the APG menu pattern: roving focus with arrow keys,
 * Home/End, and Escape to close returning focus to the trigger. Built on
 * Popover because `@radix-ui/react-dropdown-menu` is not a dependency here.
 */
export function Menu({ trigger, items, label, align = "end" }: { trigger: ReactNode; items: MenuItem[]; label: string; align?: "start" | "center" | "end" }) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => { if (open) setActive(0); }, [open]);
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']")[active];
    node?.focus();
  }, [open, active]);

  const enabled = items.filter((item) => !item.disabled);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => (i + 1) % items.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => (i - 1 + items.length) % items.length); }
    else if (event.key === "Home") { event.preventDefault(); setActive(0); }
    else if (event.key === "End") { event.preventDefault(); setActive(items.length - 1); }
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content className="menu" align={align} sideOffset={6} collisionPadding={12}>
          <div role="menu" aria-label={label} ref={listRef} onKeyDown={onKeyDown}>
            {items.map((item, index) => (
              <button
                key={item.label}
                role="menuitem"
                type="button"
                tabIndex={index === active ? 0 : -1}
                disabled={item.disabled}
                aria-disabled={item.disabled || undefined}
                title={item.disabled ? item.disabledReason : undefined}
                className={cn("menu-item", item.destructive && "menu-item-danger")}
                onClick={() => { if (item.disabled) return; setOpen(false); item.onSelect(); }}
              >
                {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
                {item.label}
              </button>
            ))}
            {enabled.length === 0 ? <p className="menu-empty">Nothing available here</p> : null}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/**
 * Right panel on desktop, bottom sheet below 900px (§15.9, §15.10). Built on
 * Dialog so focus trapping, Escape, and focus restoration come from one
 * audited implementation rather than three hand-rolled ones.
 */
export function SidePanel({
  open,
  onOpenChange,
  title,
  children,
  footer,
  headerActions,
  width,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  width?: number;
}) {
  const returnFocus = useReturnFocus(open);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="panel-backdrop" />
        <DialogPrimitive.Content
          className="side-panel"
          style={width ? { ["--panel-w" as string]: `${width}px` } : undefined}
          onCloseAutoFocus={returnFocus.onCloseAutoFocus}
        >
          <header className="side-panel-heading">
            <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
            <div className="side-panel-actions">
              {headerActions}
              <button className="modal-close" type="button" aria-label={`Close ${title}`} onClick={() => onOpenChange(false)}><X size={18} /></button>
            </div>
          </header>
          <div className="side-panel-body">{children}</div>
          {footer ? <footer className="side-panel-footer">{footer}</footer> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Left navigation drawer for mobile (§8.9). */
export function Drawer({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode }) {
  const returnFocus = useReturnFocus(open);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="panel-backdrop" />
        <DialogPrimitive.Content className="drawer" aria-label={title} onCloseAutoFocus={returnFocus.onCloseAutoFocus}>
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
