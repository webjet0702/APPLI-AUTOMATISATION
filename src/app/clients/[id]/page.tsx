import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ConfirmButton, SubmitButton } from "@/components/buttons";
import { Badge, Card, CardTitle } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { MODULE_PANELS } from "@/modules/panels";
import { listExecutions } from "@/platform/commands";
import { isUuid } from "@/platform/db";
import { getModule, MODULES } from "@/platform/modules";
import { getOrganization, listInstalledModules } from "@/platform/organizations";
import { deleteClient, toggleModule } from "../../actions";

// La lecture d'une facture par Claude peut prendre jusqu'à une minute.
export const maxDuration = 120;

export default async function ClientPage(props: PageProps<"/clients/[id]">) {
  await connection();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const organization = await getOrganization(id);
  if (!organization) notFound();

  const [installed, executions] = await Promise.all([listInstalledModules(id), listExecutions(id)]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
            ← Clients
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
            {organization.name}
            {organization.is_demo && <Badge tone="blue">Démo</Badge>}
          </h1>
          {organization.contact_email && <p className="text-sm text-slate-500">{organization.contact_email}</p>}
        </div>
        <form action={deleteClient.bind(null, id)}>
          <ConfirmButton message={`Supprimer ${organization.name} et toutes ses données ?`}>Supprimer le client</ConfirmButton>
        </form>
      </div>

      {installed.map((moduleId) => {
        const Panel = MODULE_PANELS[moduleId];
        const mod = getModule(moduleId);
        if (!Panel || !mod) return null;
        return (
          <section key={moduleId}>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">{mod.name}</h2>
            <Panel organizationId={id} />
          </section>
        );
      })}

      <Card>
        <CardTitle hint="Les automatisations activées pour ce client. Chacune a ses propres commandes.">
          Automatisations du client
        </CardTitle>
        <ul className="divide-y divide-slate-100">
          {MODULES.map((mod) => {
            const isInstalled = installed.includes(mod.id);
            return (
              <li key={mod.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-slate-900">{mod.name}</p>
                  <p className="text-sm text-slate-500">{mod.pitch}</p>
                </div>
                {mod.status === "bientot" ? (
                  <Badge>Bientôt</Badge>
                ) : (
                  <form action={toggleModule.bind(null, id, mod.id, !isInstalled)} className="shrink-0">
                    <SubmitButton variant="secondary">{isInstalled ? "Désactiver" : "Activer"}</SubmitButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardTitle hint="Chaque commande lancée pour ce client, avec son résultat. Utile pour comprendre un problème.">
          Historique des commandes
        </CardTitle>
        {executions.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune commande lancée pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {executions.map((e) => {
              const command = getModule(e.module_id)?.commands.find((c) => c.id === e.command);
              return (
                <li key={e.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Badge tone={e.status === "succes" ? "green" : "red"}>
                      {e.status === "succes" ? "Succès" : "Erreur"}
                    </Badge>
                    <span className="text-slate-900">{command?.label ?? e.command}</span>
                    <span className="text-slate-500">{e.summary ?? e.error}</span>
                  </div>
                  <span className="text-slate-400 tabular-nums">
                    {formatDateTime(new Date(e.created_at))} · {(e.duration_ms / 1000).toFixed(1)} s
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
