-- K11 Files (ADR-0035: tenant-keyed storage, short-lived signed URLs; ADR-0052: retention).
create table kernel.file (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  object_type text not null,          -- e.g. "kernel.document", "foundation.item"
  object_id uuid not null,
  filename text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null,
  storage_key text not null unique,   -- "<tenant>/<yyyy>/<file id>": never shared between tenants
  classification text not null default 'normal' check (classification in ('normal', 'confidential', 'personal')),
  retained boolean not null default false, -- statutory output (tax invoice PDFs): never deleted
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id()
);
create index file_object on kernel.file (tenant_id, object_type, object_id) where deleted_at is null;
alter table kernel.file enable row level security;
create policy tenant_isolation on kernel.file
  using (tenant_id = kernel.current_tenant()) with check (tenant_id = kernel.current_tenant());
grant select, insert, update on kernel.file to erp_app;
select kernel.enable_audit('kernel.file');

create function kernel.guard_file() returns trigger language plpgsql as $$
begin
  if old.retained and new.deleted_at is not null then
    raise exception 'file % is a retained record and cannot be deleted', old.filename using errcode = '55000';
  end if;
  if (to_jsonb(new) - 'deleted_at') <> (to_jsonb(old) - 'deleted_at') then
    raise exception 'stored files are immutable; upload a new version' using errcode = '55000';
  end if;
  return new;
end $$;
create trigger guard before update on kernel.file for each row execute function kernel.guard_file();
