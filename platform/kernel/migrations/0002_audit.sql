-- K9 Audit trail and security log (ADR-0036).
-- Business audit: written by triggers in the same transaction as the change; append-only; hash-chained per
-- tenant by a sealing step; cannot be disabled by the application. Security log: separate, insert-only.

create table kernel.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  occurred_at timestamptz not null default now(),
  user_id uuid,
  actor jsonb not null,
  trace_id text,
  table_name text not null,
  object_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  changes jsonb not null,
  reason text,
  -- filled by kernel.seal_audit(): position and hash in the tenant's chain
  seq bigint,
  prev_hash bytea,
  hash bytea,
  sealed_at timestamptz,
  unique (tenant_id, seq)
);
create index audit_log_object on kernel.audit_log (tenant_id, table_name, object_id, id);
create index audit_log_unsealed on kernel.audit_log (tenant_id, id) where seq is null;

alter table kernel.audit_log enable row level security;
alter table kernel.audit_log force row level security;
create policy tenant_read on kernel.audit_log for select using (tenant_id = kernel.current_tenant());
grant select on kernel.audit_log to erp_app; -- read only: no insert, update or delete rights for anyone in the app

-- Entries are never changed or removed. The only permitted update is sealing an unsealed entry.
create function kernel.audit_log_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'audit entries cannot be deleted' using errcode = '42501';
  end if;
  if old.hash is not null
     or (to_jsonb(new) - array['seq', 'prev_hash', 'hash', 'sealed_at']) <> (to_jsonb(old) - array['seq', 'prev_hash', 'hash', 'sealed_at']) then
    raise exception 'audit entries cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard before update or delete on kernel.audit_log for each row execute function kernel.audit_log_guard();

-- Generic row audit trigger. Arguments: extra column names to leave out (e.g. secrets such as pin_hash).
create function kernel.audit_row() returns trigger language plpgsql security definer
  set search_path = pg_catalog, pg_temp as $$
declare
  skip text[] := array['created_at', 'created_by', 'updated_at', 'updated_by', 'version'] || coalesce(tg_argv::text[], '{}');
  old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - skip end;
  new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - skip end;
  diff jsonb := '{}';
  k text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_row) loop
      if (old_row -> k) is distinct from (new_row -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_array(old_row -> k, new_row -> k));
      end if;
    end loop;
    if diff = '{}' then return null; end if;
  elsif tg_op = 'INSERT' then
    diff := new_row;
  else
    diff := old_row;
  end if;
  insert into kernel.audit_log (tenant_id, user_id, actor, trace_id, table_name, object_id, action, changes, reason)
  values (
    coalesce((new_row ->> 'tenant_id')::uuid, (old_row ->> 'tenant_id')::uuid, kernel.current_tenant()),
    kernel.current_user_id(),
    kernel.current_actor(),
    nullif(current_setting('app.trace_id', true), ''),
    tg_table_schema || '.' || tg_table_name,
    coalesce((new_row ->> 'id')::uuid, (old_row ->> 'id')::uuid),
    lower(tg_op),
    diff,
    nullif(current_setting('app.audit_reason', true), '')
  );
  return null;
end $$;

-- Tables call this in their migration: select kernel.enable_audit('schema.table', array['secret_col']);
create function kernel.enable_audit(target regclass, excluded text[] default '{}') returns void language plpgsql as $$
begin
  execute format('create trigger audit after insert or update or delete on %s for each row execute function kernel.audit_row(%s)',
    target, (select coalesce(string_agg(quote_literal(x), ', '), '') from unnest(excluded) x));
end $$;

select kernel.enable_audit('kernel.org_unit');
select kernel.enable_audit('kernel.tenant_membership', array['pin_hash', 'pin_failed_attempts', 'pin_locked_until']);

-- Hash chain per tenant (tamper evidence). seq is the sealing order.
create table kernel.audit_chain (
  tenant_id uuid primary key,
  last_seq bigint not null default 0,
  last_hash bytea not null default '\x'
);

create function kernel.audit_entry_digest(e kernel.audit_log, prev bytea) returns bytea language sql immutable as $$
  select sha256(prev || convert_to(jsonb_build_object(
    'id', e.id, 'tenant_id', e.tenant_id, 'at_us', (extract(epoch from e.occurred_at) * 1000000)::bigint,
    'user_id', e.user_id, 'actor', e.actor, 'trace_id', e.trace_id, 'table', e.table_name, 'object_id', e.object_id,
    'action', e.action, 'changes', e.changes, 'reason', e.reason, 'seq', e.seq)::text, 'UTF8'))
$$;

-- Seal committed, unsealed entries of one tenant, oldest first. Run by the worker (owner role).
create function kernel.seal_audit(p_tenant uuid, p_limit integer default 5000) returns integer language plpgsql as $$
declare
  chain kernel.audit_chain;
  e kernel.audit_log;
  n integer := 0;
begin
  insert into kernel.audit_chain (tenant_id) values (p_tenant) on conflict do nothing;
  select * into chain from kernel.audit_chain where tenant_id = p_tenant for update;
  for e in select * from kernel.audit_log where tenant_id = p_tenant and seq is null order by id limit p_limit for update loop
    e.seq := chain.last_seq + 1;
    e.prev_hash := chain.last_hash;
    e.hash := kernel.audit_entry_digest(e, chain.last_hash);
    update kernel.audit_log set seq = e.seq, prev_hash = e.prev_hash, hash = e.hash, sealed_at = now() where id = e.id;
    chain.last_seq := e.seq;
    chain.last_hash := e.hash;
    n := n + 1;
  end loop;
  update kernel.audit_chain set last_seq = chain.last_seq, last_hash = chain.last_hash where tenant_id = p_tenant;
  return n;
end $$;

-- Recompute the chain; returns the first broken position, or NULL when intact.
create function kernel.verify_audit_chain(p_tenant uuid) returns bigint language plpgsql stable as $$
declare
  e kernel.audit_log;
  prev bytea := '\x';
  expected bigint := 1;
begin
  for e in select * from kernel.audit_log where tenant_id = p_tenant and seq is not null order by seq loop
    if e.seq <> expected or e.prev_hash <> prev or e.hash <> kernel.audit_entry_digest(e, prev) then
      return expected;
    end if;
    prev := e.hash;
    expected := expected + 1;
  end loop;
  if (select last_seq from kernel.audit_chain where tenant_id = p_tenant) is distinct from expected - 1
     and exists (select from kernel.audit_chain where tenant_id = p_tenant) then
    return expected; -- entries removed from the end
  end if;
  return null;
end $$;

-- Security log: authentication, permission changes, step-up, exports, support access, configuration.
-- Out of reach of application admins: the application can only append through the function below.
create table kernel.security_event (
  id bigint generated always as identity primary key,
  tenant_id uuid,
  occurred_at timestamptz not null default now(),
  event_type text not null,
  outcome text not null check (outcome in ('success', 'failure', 'denied')),
  user_id uuid,
  actor jsonb,
  ip inet,
  user_agent text,
  trace_id text,
  details jsonb not null default '{}'
);
create index security_event_tenant on kernel.security_event (tenant_id, occurred_at);

create function kernel.log_security_event(p_type text, p_outcome text, p_details jsonb default '{}',
    p_user_id uuid default null, p_tenant uuid default null, p_ip inet default null, p_user_agent text default null)
  returns void language sql security definer set search_path = pg_catalog, pg_temp as $$
  insert into kernel.security_event (tenant_id, event_type, outcome, user_id, actor, ip, user_agent, trace_id, details)
  values (coalesce(p_tenant, kernel.current_tenant()), p_type, p_outcome, coalesce(p_user_id, kernel.current_user_id()),
          kernel.current_actor(), p_ip, left(p_user_agent, 300), nullif(current_setting('app.trace_id', true), ''), p_details)
$$;
revoke all on function kernel.log_security_event(text, text, jsonb, uuid, uuid, inet, text) from public;
grant execute on function kernel.log_security_event(text, text, jsonb, uuid, uuid, inet, text) to erp_app;
