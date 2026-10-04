// Partagé entre le proxy (qui protège les pages) et les actions serveur.
// Volontairement sans import de Next.js pour pouvoir être utilisé partout.

export const SESSION_COOKIE = "session";

/** Jeton stocké dans le cookie : une empreinte du mot de passe, jamais le mot de passe lui-même. */
export async function sessionToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`appli-automatisation:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Sans mot de passe configuré, l'appli n'est ouverte qu'en local (développement). */
export function authMode(): "ouvert" | "mot-de-passe" | "bloque" {
  if (process.env.APP_PASSWORD) return "mot-de-passe";
  return process.env.NODE_ENV === "production" ? "bloque" : "ouvert";
}
