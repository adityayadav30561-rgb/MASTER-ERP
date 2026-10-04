-- Kernel core: application role, context functions, tenants, memberships, organisation units.
-- ADR-0035 (tenant isolation), ADR-0049 (conventions), ADR-0004 (organisation), ADR-0069 (membership).

-- The application connects as a login role that is a member of erp_app. erp_app owns nothing and cannot
-- bypass RLS, so Row-Level Security always applies to it. Tables are owned by the migration (owner) role,
-- which provisioning and system jobs use deliberately; the app checks its own role at start-up
-- (assertApplicationRole) and refuses to run as an owner, superuser or BYPASSRLS role.
do $$ begin
  if not exists (select from pg_roles where rolname = 'erp_app') then
    create role erp_app nologin nosuperuser nobypassrls;
  end if;
end $$;

grant usage on schema kernel to erp_app;

-- UUIDv7 for SQL-side defaults (the application normally generates ids itself).
create function kernel.uuid_v7() returns uuid language plpgsql volatile as $$
declare
  ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  bytes bytea := uuid_send(gen_random_uuid()); -- 16 random bytes without pgcrypto
begin
  bytes := overlay(bytes placing substring(int8send(ms) from 3 for 6) from 1 for 6);
  bytes := set_byte(bytes, 6, (get_byte(bytes, 6) & 15) | 112);
  bytes := set_byte(bytes, 8, (get_byte(bytes, 8) & 63) | 128);
  return encode(bytes, 'hex')::uuid;
end $$;

-- Context set by withTenant() as transaction-local settings. Unset → NULL → no rows (fail closed).
create function kernel.current_tenant() returns uuid language sql stable as
  $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;
create function kernel.current_user_id() returns uuid language sql stable as
  $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
create function kernel.current_actor() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('app.actor', true), ''), '{"kind":"system"}')::jsonb $$;

grant execute on function kernel.uuid_v7(), kernel.current_tenant(), kernel.current_user_id(), kernel.current_actor() to erp_app;

-- Standard row maintenance: bump version, stamp updated_at/updated_by (optimistic locking, ADR-0050).
create function kernel.touch_row() returns trigger language plpgsql as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := kernel.current_user_id();
  return new;
end $$;

-- Tenants (ADR-0063 lifecycle). Created by provisioning with the owner role.
create table kernel.tenant (
  id uuid primary key,
  code text not null unique check (code ~ '^[a-z][a-z0-9-]{1,30}$'), -- also the sub-domain
  name text not null,
  status text not null default 'onboarding'
    check (status in ('demo', 'onboarding', 'active', 'past_due', 'suspended', 'cancelled', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1
);
alter table kernel.tenant enable row level security;
create policy tenant_self on kernel.tenant using (id = kernel.current_tenant());
grant select on kernel.tenant to erp_app;
create trigger touch before update on kernel.tenant for each row execute function kernel.touch_row();

-- Membership of a person (global identity, ADR-0069) in a tenant.
create table kernel.tenant_membership (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  user_id uuid not null, -- identity.user.id (global; no foreign key across the identity boundary)
  display_name text not null,
  status text not null default 'active' check (status in ('invited', 'active', 'suspended', 'left')),
  employee_code text,
  pin_hash text,
  pin_failed_attempts integer not null default 0,
  pin_locked_until timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  unique (tenant_id, user_id),
  unique (tenant_id, employee_code)
);
alter table kernel.tenant_membership enable row level security;
create policy tenant_isolation on kernel.tenant_membership
  using (tenant_id = kernel.current_tenant()) with check (tenant_id = kernel.current_tenant());
grant select, insert, update on kernel.tenant_membership to erp_app;
create trigger touch before update on kernel.tenant_membership for each row execute function kernel.touch_row();

-- Organisation units (ADR-0004): companies, sites, warehouses, … in one typed tree.
-- Business attributes (GSTIN, addresses) live in the foundation layer; this is the scope skeleton.
create table kernel.org_unit (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  kind text not null check (kind in ('grouping', 'company', 'site', 'warehouse', 'location', 'work_center',
    'department', 'team', 'cost_center', 'profit_center')),
  parent_id uuid references kernel.org_unit (id),
  code text not null,
  name text not null,
  valid_from date not null default '1900-01-01',
  valid_to date,
  archived_at timestamptz,
  ext jsonb not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  unique (tenant_id, kind, code),
  check (parent_id is distinct from id)
);
create index org_unit_parent on kernel.org_unit (tenant_id, parent_id);
alter table kernel.org_unit enable row level security;
create policy tenant_isolation on kernel.org_unit
  using (tenant_id = kernel.current_tenant()) with check (tenant_id = kernel.current_tenant());
grant select, insert, update on kernel.org_unit to erp_app;
create trigger touch before update on kernel.org_unit for each row execute function kernel.touch_row();

-- All ancestors of a unit including itself (scopes inherit downward, ADR-0004 / Step 6 §5.4).
create function kernel.org_unit_ancestors(unit uuid) returns setof uuid language sql stable as $$
  with recursive up(id, parent_id, depth) as (
    select id, parent_id, 0 from kernel.org_unit where id = unit
    union all
    select o.id, o.parent_id, up.depth + 1 from kernel.org_unit o join up on o.id = up.parent_id where up.depth < 20
  )
  select id from up
$$;
grant execute on function kernel.org_unit_ancestors(uuid) to erp_app;
