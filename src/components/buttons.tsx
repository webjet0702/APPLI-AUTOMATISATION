"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClasses } from "./ui";

/** Bouton d'envoi qui se désactive pendant que l'action tourne. */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: keyof typeof buttonClasses;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClasses[variant]}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/** Demande confirmation avant une action irréversible (suppression). */
export function ConfirmButton({ children, message }: { children: ReactNode; message: string }) {
  return (
    <button
      type="submit"
      className={buttonClasses.danger}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClasses.secondary}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copié ✓" : "Copier le rapport"}
    </button>
  );
}
