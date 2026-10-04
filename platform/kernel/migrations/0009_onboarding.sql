-- Onboarding checklist (Step 5A §6): most steps are derived from data; review steps are confirmed by a person.
create table kernel.onboarding_step (
  id uuid not null default kernel.uuid_v7() unique,
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  key text not null check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  done_at timestamptz not null default now(),
  done_by uuid default kernel.current_user_id(),
  primary key (tenant_id, key)
);
alter table kernel.onboarding_step enable row level security;
create policy tenant_isolation on kernel.onboarding_step
  using (tenant_id = kernel.current_tenant()) with check (tenant_id = kernel.current_tenant());
grant select, insert, delete on kernel.onboarding_step to erp_app;
select kernel.enable_audit('kernel.onboarding_step');

-- Which package template a role came from, so later package upgrades can offer template changes (ADR-0030).
alter table kernel.role add column template_package text;
