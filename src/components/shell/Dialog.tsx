"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Fenêtre modale basée sur <dialog> (piège du focus, Échap, retour du focus natifs).
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const width = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" }[size];

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${width} rounded-[22px] border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-[rgba(10,18,36,0.45)] backdrop:backdrop-blur-[2px]`}
    >
      {open ? (
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <h2 id={titleId} className="text-xl font-semibold">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="-m-2 grid h-11 w-11 place-items-center rounded-full text-ink-2 hover:bg-surface-2" aria-label="Fermer">
              <X aria-hidden="true" />
            </button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}
