-- K12 Configuration: runtime settings and pinned package versions (ADR-0011, ADR-0024, ADR-0025, ADR-0030).

create table kernel.setting (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  key text not null check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  org_unit_id uuid references kernel.org_unit (id), -- null = whole tenant; else company/site override
  value jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1
);
create unique index setting_unique on kernel.setting (tenant_id, key, coalesce(org_unit_id, '00000000-0000-0000-0000-000000000000'));
alter table kernel.setting enable row level security;
create policy tenant_isolation on kernel.setting
  using (tenant_id = kernel.current_tenant()) with check (tenant_id = kernel.current_tenant());
grant select, insert, update, delete on kernel.setting to erp_app;
create trigger touch before update on kernel.setting for each row execute function kernel.touch_row();
select kernel.enable_audit('kernel.setting');

-- Which package versions a tenant runs (pinned; upgrades are deliberate, ADR-0030).
create table kernel.tenant_package (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  package_id text not null,
  version text not null,
  checksum text not null,
  applied_at timestamptz not null default now(),
  applied_by uuid default kernel.current_user_id(),
  unique (tenant_id, package_id)
);
alter table kernel.tenant_package enable row level security;
create policy tenant_isolation on kernel.tenant_package
  using (tenant_id = kernel.current_tenant()) with check (tenant_id = kernel.current_tenant());
grant select, insert, update on kernel.tenant_package to erp_app;
select kernel.enable_audit('kernel.tenant_package');

-- Ancestors with their distance (0 = the unit itself): nearest override wins.
create function kernel.org_unit_path(unit uuid) returns table (id uuid, depth integer) language sql stable as $$
  with recursive up(id, parent_id, depth) as (
    select o.id, o.parent_id, 0 from kernel.org_unit o where o.id = unit
    union all
    select o.id, o.parent_id, up.depth + 1 from kernel.org_unit o join up on o.id = up.parent_id where up.depth < 20
  )
  select up.id, up.depth from up
$$;
grant execute on function kernel.org_unit_path(uuid) to erp_app;
