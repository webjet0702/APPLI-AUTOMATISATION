import Link from "next/link";
import { connection } from "next/server";
import { SubmitButton } from "@/components/buttons";
import { Badge, Card, CardTitle, inputClasses } from "@/components/ui";
import { MODULE_SUMMARIES } from "@/modules/panels";
import { MODULES } from "@/platform/modules";
import { listInstalledModules, listOrganizations } from "@/platform/organizations";
import { createClient, loadDemo } from "./actions";

export default async function HomePage() {
  await connection();
  const organizations = await listOrganizations();
  const summaries = await Promise.all(
    organizations.map(async (org) => {
      const installed = await listInstalledModules(org.id);
      const lines = await Promise.all(
        installed.filter((m) => MODULE_SUMMARIES[m]).map((m) => MODULE_SUMMARIES[m](org.id)),
      );
      return lines.join(" · ");
    }),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Vos clients</h1>
        <p className="mt-1 text-slate-500">Chaque restaurant a ses propres automatisations et ses propres données.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Nouveau client</CardTitle>
          <form action={createClient} className="space-y-3">
            <input name="name" required placeholder="Nom du restaurant" className={inputClasses} />
            <input name="contactEmail" type="email" placeholder="Email du gérant (facultatif)" className={inputClasses} />
            <SubmitButton pendingLabel="Création…">Créer le client</SubmitButton>
          </form>
        </Card>
        <Card>
          <CardTitle hint="Un restaurant fictif avec 12 semaines de factures et des hausses cachées. Parfait pour montrer l'outil en rendez-vous.">
            Démonstration
          </CardTitle>
          <form action={loadDemo}>
            <SubmitButton variant="secondary" pendingLabel="Préparation…">
              Ouvrir la démo
            </SubmitButton>
          </form>
        </Card>
      </div>

      {organizations.length > 0 && (
        <Card>
          <CardTitle>Clients ({organizations.length})</CardTitle>
          <ul className="divide-y divide-slate-100">
            {organizations.map((org, index) => (
              <li key={org.id}>
                <Link
                  href={`/clients/${org.id}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 hover:bg-slate-50"
                >
                  <span>
                    <span className="block font-medium text-slate-900">{org.name}</span>
                    {summaries[index] && <span className="block text-sm text-slate-500">{summaries[index]}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    {org.is_demo && <Badge tone="blue">Démo</Badge>}
                    <span className="text-slate-400">→</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Catalogue d&apos;automatisations</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {MODULES.map((mod) => (
            <Card key={mod.id}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="font-medium text-slate-900">{mod.name}</h3>
                {mod.status === "disponible" ? <Badge tone="green">Disponible</Badge> : <Badge>Bientôt</Badge>}
              </div>
              <p className="text-sm text-slate-600">{mod.pitch}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
