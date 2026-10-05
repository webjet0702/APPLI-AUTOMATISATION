// Structure de la base de données. Exécutée au démarrage : chaque instruction
// est idempotente (« if not exists »), donc on peut la relancer sans risque.
export const SCHEMA_SQL = `
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- Quelles automatisations sont activées pour quel client.
create table if not exists installations (
  organization_id uuid not null references organizations(id) on delete cascade,
  module_id text not null,
  config jsonb not null default '{}'::jsonb,
  enabled_at timestamptz not null default now(),
  primary key (organization_id, module_id)
);

-- Historique de chaque commande lancée (succès ou erreur).
create table if not exists executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  module_id text not null,
  command text not null,
  status text not null,
  summary text,
  error text,
  duration_ms integer not null,
  created_at timestamptz not null default now()
);
create index if not exists executions_org_created on executions (organization_id, created_at desc);

-- Module « suivi des prix fournisseurs »
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  supplier text not null,
  supplier_key text not null,
  invoice_number text,
  invoice_date date not null,
  total_ht numeric(12, 2),
  file_name text,
  source text not null default 'upload',
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists invoices_org_date on invoices (organization_id, invoice_date desc);
-- Ajouté après la première version : date à laquelle quelqu'un a relu la facture.
alter table invoices add column if not exists verified_at timestamptz;

create table if not exists invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  product_key text not null,
  reference text,
  label text not null,
  unit text not null,
  quantity numeric(12, 3) not null,
  unit_price_ht numeric(12, 4) not null,
  line_total_ht numeric(12, 2)
);
create index if not exists invoice_lines_org_product on invoice_lines (organization_id, product_key);

-- Sur Supabase, toute table de « public » est aussi exposée par son API web.
-- RLS activé sans aucune règle = cette API ne peut rien lire ni écrire ;
-- l'appli, connectée directement à Postgres, n'est pas concernée.
alter table organizations enable row level security;
alter table installations enable row level security;
alter table executions enable row level security;
alter table invoices enable row level security;
alter table invoice_lines enable row level security;
`;
