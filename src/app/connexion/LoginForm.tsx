"use client";

import { useActionState } from "react";
import { buttonClasses, inputClasses } from "@/components/ui";
import { login, type LoginState } from "../actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={formAction} className="space-y-3">
      <input
        type="password"
        name="password"
        required
        autoFocus
        autoComplete="current-password"
        placeholder="Mot de passe"
        className={inputClasses}
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className={`${buttonClasses.primary} w-full`}>
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
