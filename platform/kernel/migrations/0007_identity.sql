-- K2 Identity (ADR-0032, ADR-0058, ADR-0069). Global identities live in the `identity` schema, whose tables
-- are created by the authentication library's own migrations (migrateIdentity). They hold no tenant data.
create schema if not exists identity;
grant usage on schema identity to erp_app;
alter default privileges in schema identity grant select, insert, update, delete on tables to erp_app;

-- Shop-floor devices (Step 6 §4.3): a registered tablet at a site. The token is shown once and stored hashed.
create table kernel.shop_device (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  site_id uuid not null references kernel.org_unit (id),
  name text not null,
  token_hash text not null unique,
  active boolean not null default true,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1
);
alter table kernel.shop_device enable row level security;
create policy tenant_isolation on kernel.shop_device
  using (tenant_id = kernel.current_tenant()) with check (tenant_id = kernel.current_tenant());
grant select, insert, update on kernel.shop_device to erp_app;
create trigger touch before update on kernel.shop_device for each row execute function kernel.touch_row();
select kernel.enable_audit('kernel.shop_device', array['token_hash', 'last_seen_at']);

-- Sub-domain → tenant, before any tenant context exists (login page). Returns only id and status.
create function kernel.resolve_tenant(p_code text) returns table (id uuid, status text)
  language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select t.id, t.status from kernel.tenant t where t.code = lower(p_code)
$$;
revoke all on function kernel.resolve_tenant(text) from public;
grant execute on function kernel.resolve_tenant(text) to erp_app;
