begin;

create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  specialty text,
  description text,
  professional_license text,
  specialist_license text,
  default_working_hours_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_providers_tenant_name
  on public.providers (tenant_id, lower(name));

create index if not exists idx_providers_tenant_active
  on public.providers (tenant_id, is_active, sort_order);

create table if not exists public.provider_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  calcom_event_type_id text,
  duration_minutes integer,
  price numeric,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_provider_services_provider_service
  on public.provider_services (provider_id, service_id);

create index if not exists idx_provider_services_tenant_service
  on public.provider_services (tenant_id, service_id, is_active, sort_order);

create index if not exists idx_provider_services_provider
  on public.provider_services (provider_id, is_active, sort_order);

alter table public.appointments
  add column if not exists provider_id uuid references public.providers(id);

create index if not exists idx_appointments_tenant_provider_start
  on public.appointments (tenant_id, provider_id, start_at);

alter table public.session_state
  add column if not exists active_provider_id uuid references public.providers(id);

alter table public.providers enable row level security;
alter table public.provider_services enable row level security;

-- Los datos iniciales (doctores reales) están en privado/supabase/ y no se suben al repo.

commit;
