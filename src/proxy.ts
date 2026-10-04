import { NextResponse, type NextRequest } from "next/server";
import { authMode, SESSION_COOKIE, sessionToken } from "./platform/session";

// Protège toutes les pages derrière le mot de passe APP_PASSWORD.
export async function proxy(request: NextRequest) {
  const mode = authMode();
  if (mode === "ouvert") return NextResponse.next();
  if (mode === "bloque") {
    return new NextResponse(
      "Appli verrouillée : définissez la variable d'environnement APP_PASSWORD pour y accéder.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const isLoginPage = request.nextUrl.pathname === "/connexion";
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const loggedIn = cookie === (await sessionToken(process.env.APP_PASSWORD!));

  if (!loggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL("/connexion", request.url));
  }
  if (loggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
