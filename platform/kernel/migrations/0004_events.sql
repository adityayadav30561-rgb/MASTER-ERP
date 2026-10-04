-- K8 Events and jobs (ADR-0040, ADR-0041, ADR-0055).
-- After-commit reactions are jobs in Graphile Worker's queue, created in the business transaction
-- (transactional outbox). Consumers record processed event ids in an inbox (idempotency).

-- Enqueue with the owner's rights; the tenant is stamped from the transaction context and cannot be forged.
create function kernel.enqueue_job(p_task text, p_payload jsonb, p_queue text default null,
    p_job_key text default null, p_run_at timestamptz default null, p_max_attempts integer default 10)
  returns bigint language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  tenant uuid := kernel.current_tenant();
  job_id bigint;
begin
  if tenant is null then
    raise exception 'enqueue_job: no tenant context' using errcode = '42501';
  end if;
  select id into job_id from graphile_worker.add_job(
    p_task,
    (p_payload || jsonb_build_object('tenant_id', tenant))::json,
    queue_name => p_queue,
    job_key => p_job_key,
    run_at => p_run_at,
    max_attempts => p_max_attempts
  );
  return job_id;
end $$;
revoke all on function kernel.enqueue_job(text, jsonb, text, text, timestamptz, integer) from public;
grant execute on function kernel.enqueue_job(text, jsonb, text, text, timestamptz, integer) to erp_app;

-- Inbox: one row per (consumer, event) processed, written in the consumer's own transaction.
create table kernel.inbox (
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  consumer text not null,
  event_id uuid not null,
  processed_at timestamptz not null default now(),
  primary key (consumer, event_id)
);
alter table kernel.inbox enable row level security;
create policy tenant_isolation on kernel.inbox
  using (tenant_id = kernel.current_tenant()) with check (tenant_id = kernel.current_tenant());
grant select, insert on kernel.inbox to erp_app;
