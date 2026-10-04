import { cookies } from "next/headers";
import { authMode, SESSION_COOKIE, sessionToken } from "./session";

export async function isAuthenticated(): Promise<boolean> {
  const mode = authMode();
  if (mode === "ouvert") return true;
  if (mode === "bloque") return false;
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  return cookie === (await sessionToken(process.env.APP_PASSWORD!));
}

/** À appeler au début de chaque action serveur : le proxy ne suffit pas à les protéger. */
export async function requireAuth(): Promise<void> {
  if (!(await isAuthenticated())) {
    throw new Error("Accès refusé : reconnectez-vous.");
  }
}
