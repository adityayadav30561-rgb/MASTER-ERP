-- K4 Authorization (ADR-0033, ADR-0034): scoped RBAC + CEL record conditions + field groups +
-- approval limits + segregation of duties. Roles and assignments are runtime settings (Step 5 §5 #12).

create table kernel.tenant_entitlement (
  tenant_id uuid not null references kernel.tenant (id),
  module text not null,
  active boolean not null default true,
  primary key (tenant_id, module)
);
alter table kernel.tenant_entitlement enable row level security;
create policy tenant_read on kernel.tenant_entitlement for select using (tenant_id = kernel.current_tenant());
grant select on kernel.tenant_entitlement to erp_app; -- set by provisioning/billing (owner), read by the app

create table kernel.role (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  code text not null,
  name text not null,
  description text,
  privileged boolean not null default false,  -- MFA mandatory for holders (ADR-0032)
  shop_floor boolean not null default false,  -- usable from a registered device with a PIN
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  unique (tenant_id, code)
);

create table kernel.role_permission (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  role_id uuid not null references kernel.role (id) on delete cascade,
  permission text not null check (permission ~ '^(\*|[a-z][a-z0-9_]*(\.(\*|[a-z][a-z0-9_]*)){0,2})$'),
  condition text,                    -- CEL record condition, e.g. record.state == 'draft'
  limit_amount numeric(20, 2),       -- approval authority (ADR-0034)
  limit_currency char(3),
  unique (role_id, permission),
  check ((limit_amount is null) = (limit_currency is null))
);

create table kernel.role_field_group (
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  role_id uuid not null references kernel.role (id) on delete cascade,
  object_type text not null,         -- "purchase.purchase_order" or "*"
  field_group text not null,         -- "cost", "purchase_price", "bank", "personal", "selling_price"
  access text not null check (access in ('read', 'write')),
  primary key (role_id, object_type, field_group)
);

create table kernel.role_assignment (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  membership_id uuid not null references kernel.tenant_membership (id),
  role_id uuid not null references kernel.role (id),
  scope_type text not null check (scope_type in ('tenant', 'org_unit', 'own', 'assigned', 'party')),
  scope_id uuid,                     -- org unit (company/site/warehouse/grouping) or party
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  check ((scope_type in ('org_unit', 'party')) = (scope_id is not null))
);
create index role_assignment_member on kernel.role_assignment (tenant_id, membership_id);

create table kernel.sod_rule (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  object_type text not null,
  first_action text not null,        -- e.g. "create"
  second_action text not null,       -- e.g. "approve"
  mode text not null check (mode in ('block', 'warn', 'allow')),
  description text,
  unique (tenant_id, object_type, first_action, second_action)
);

do $$
declare t text;
begin
  foreach t in array array['role', 'role_permission', 'role_field_group', 'role_assignment', 'sod_rule'] loop
    execute format('alter table kernel.%I enable row level security', t);
    execute format('create policy tenant_isolation on kernel.%I using (tenant_id = kernel.current_tenant()) with check (tenant_id = kernel.current_tenant())', t);
    execute format('grant select, insert, update, delete on kernel.%I to erp_app', t);
  end loop;
end $$;
create trigger touch before update on kernel.role for each row execute function kernel.touch_row();
select kernel.enable_audit('kernel.role');
select kernel.enable_audit('kernel.role_permission');
select kernel.enable_audit('kernel.role_assignment');
select kernel.enable_audit('kernel.sod_rule');
