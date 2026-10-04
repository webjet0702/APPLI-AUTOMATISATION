import type { Metadata } from "next";
import Link from "next/link";
import { logout } from "./actions";
import { authMode } from "@/platform/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Appli Automatisation",
  description: "Automatisations sur mesure pour les restaurants.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold text-slate-900">
              Appli Automatisation
            </Link>
            {authMode() === "mot-de-passe" && (
              <form action={logout}>
                <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">
                  Se déconnecter
                </button>
              </form>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
