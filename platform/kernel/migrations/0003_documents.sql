-- K6 Document framework: numbering series, document registry, links (ADR-0006, ADR-0007, ADR-0029, ADR-0049).

-- Numbering series (runtime settings, Step 5 §5 #10). Locks such as GST's 16-character rule arrive as
-- max_length / allowed_pattern from the India pack and cannot be relaxed by the tenant.
create table kernel.number_series (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  document_type text not null,                  -- e.g. 'sales.tax_invoice'
  company_id uuid not null references kernel.org_unit (id),
  site_id uuid references kernel.org_unit (id), -- site-specific series override the company series
  code text not null default 'default',
  pattern text not null,                        -- tokens: {FY} {FYYYY} {YYYY} {YY} {MM} {SEQ:n} {COMPANY} {SITE}
  reset_policy text not null default 'fiscal_year' check (reset_policy in ('never', 'fiscal_year', 'calendar_year', 'monthly')),
  allocation text not null default 'posting' check (allocation in ('creation', 'posting')),
  gapless boolean not null default true,
  fy_start_month integer not null default 4 check (fy_start_month between 1 and 12),
  max_length integer check (max_length > 0),
  allowed_pattern text,                         -- regular expression the rendered number must match
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  check (not gapless or allocation = 'posting')
);
create unique index number_series_unique on kernel.number_series
  (tenant_id, document_type, company_id, coalesce(site_id, '00000000-0000-0000-0000-000000000000'), code);
alter table kernel.number_series enable row level security;
create policy tenant_isolation on kernel.number_series
  using (tenant_id = kernel.current_tenant()) with check (tenant_id = kernel.current_tenant());
grant select, insert, update on kernel.number_series to erp_app;
create trigger touch before update on kernel.number_series for each row execute function kernel.touch_row();
select kernel.enable_audit('kernel.number_series');

-- One counter per series and period. The row lock taken by the increment is held until commit:
-- that is what makes posting-time numbers gapless (a rolled-back posting returns its number).
create table kernel.number_counter (
  series_id uuid not null references kernel.number_series (id),
  period_key text not null,                     -- '2026-27', '2026', '2026-10' or '' (never resets)
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  last_value bigint not null check (last_value >= 0),
  primary key (series_id, period_key)
);
alter table kernel.number_counter enable row level security;
create policy tenant_isolation on kernel.number_counter
  using (tenant_id = kernel.current_tenant()) with check (tenant_id = kernel.current_tenant());
grant select, insert, update on kernel.number_counter to erp_app;
select kernel.enable_audit('kernel.number_counter');

-- Document registry: the shared header of every document (ADR-0049). Modules keep typed header and line
-- tables keyed by the same id.
create table kernel.document (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  document_type text not null,
  company_id uuid not null references kernel.org_unit (id),
  site_id uuid references kernel.org_unit (id),
  number text,                                  -- null until assigned (drafts of posting-time series)
  fiscal_year text,
  series_id uuid references kernel.number_series (id),
  temp_ref text not null,                       -- shown for drafts, e.g. "DRAFT-7F3A91"
  state text not null,
  sub_status text,
  locked boolean not null default false,        -- true once the document left its editable states (ADR-0007)
  document_date date not null,
  party_id uuid,
  currency char(3),
  total_amount numeric(20, 2),
  anchor_type text,
  anchor_id uuid,
  revision integer not null default 1,
  amends_id uuid references kernel.document (id),
  posted_at timestamptz,
  posted_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  ext jsonb not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1
);
create unique index document_number_unique on kernel.document
  (tenant_id, company_id, document_type, coalesce(fiscal_year, ''), number, revision) where number is not null;
create index document_lookup on kernel.document (tenant_id, document_type, state, document_date);
create index document_anchor on kernel.document (tenant_id, anchor_type, anchor_id) where anchor_id is not null;
create index document_party on kernel.document (tenant_id, party_id) where party_id is not null;
alter table kernel.document enable row level security;
create policy tenant_isolation on kernel.document
  using (tenant_id = kernel.current_tenant()) with check (tenant_id = kernel.current_tenant());
grant select, insert, update, delete on kernel.document to erp_app;
create trigger touch before update on kernel.document for each row execute function kernel.touch_row();
select kernel.enable_audit('kernel.document');

-- Posted documents are immutable (ADR-0007): once locked, only lifecycle columns may change, and the
-- document can never be deleted. Drafts may be deleted.
create function kernel.guard_document() returns trigger language plpgsql as $$
declare
  lifecycle text[] := array['state', 'sub_status', 'locked', 'posted_at', 'posted_by', 'cancelled_at', 'cancelled_by',
                            'cancel_reason', 'updated_at', 'updated_by', 'version'];
begin
  if tg_op = 'DELETE' then
    if old.locked or old.posted_at is not null then
      raise exception 'document % is posted and cannot be deleted', coalesce(old.number, old.temp_ref) using errcode = '55000';
    end if;
    return old;
  end if;
  if old.number is null then
    lifecycle := lifecycle || array['number', 'series_id', 'fiscal_year']; -- the number is assigned once, at posting
  end if;
  if old.locked and (to_jsonb(new) - lifecycle) <> (to_jsonb(old) - lifecycle) then
    raise exception 'document % is posted and cannot be edited', coalesce(old.number, old.temp_ref) using errcode = '55000';
  end if;
  return new;
end $$;
create trigger guard before update or delete on kernel.document for each row execute function kernel.guard_document();

-- For module line/header tables with a document_id column: refuse changes once the document is locked.
create function kernel.guard_document_rows() returns trigger language plpgsql as $$
declare
  doc uuid := case when tg_op = 'DELETE' then old.document_id else new.document_id end;
begin
  if exists (select from kernel.document where id = doc and locked) then
    raise exception 'document is posted: its lines cannot be changed' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and old.document_id <> new.document_id
     and exists (select from kernel.document where id = old.document_id and locked) then
    raise exception 'document is posted: its lines cannot be moved' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- Document links (ADR-0006). source = earlier document (commitment), target = later document.
create table kernel.document_link (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  link_type text not null check (link_type in ('created_from', 'fulfils', 'settles', 'references')),
  source_document_id uuid not null references kernel.document (id),
  source_line_id uuid,
  target_document_id uuid not null references kernel.document (id) on delete cascade, -- deleting a draft removes its links
  target_line_id uuid,
  quantity numeric(24, 6),
  uom text,
  amount numeric(20, 2),
  currency char(3),
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  check (source_document_id <> target_document_id),
  check (link_type in ('fulfils', 'created_from') or quantity is null),
  check (link_type = 'settles' or amount is null or link_type = 'created_from')
);
create index document_link_source on kernel.document_link (tenant_id, source_document_id, source_line_id);
create index document_link_target on kernel.document_link (tenant_id, target_document_id);
alter table kernel.document_link enable row level security;
create policy tenant_isolation on kernel.document_link
  using (tenant_id = kernel.current_tenant()) with check (tenant_id = kernel.current_tenant());
grant select, insert on kernel.document_link to erp_app; -- links are facts: never edited
select kernel.enable_audit('kernel.document_link');

-- Quantity / amount already covered by later documents. Only posted, not cancelled targets count:
-- open quantity = ordered − linked_quantity (ADR-0006, "open quantities are derived from links").
create function kernel.linked_quantity(p_source_line uuid, p_link_type text default 'fulfils') returns numeric
  language sql stable as $$
  select coalesce(sum(l.quantity), 0)
  from kernel.document_link l join kernel.document t on t.id = l.target_document_id
  where l.source_line_id = p_source_line and l.link_type = p_link_type
    and t.posted_at is not null and t.cancelled_at is null
$$;
create function kernel.linked_amount(p_source_document uuid, p_link_type text default 'settles') returns numeric
  language sql stable as $$
  select coalesce(sum(l.amount), 0)
  from kernel.document_link l join kernel.document t on t.id = l.target_document_id
  where l.source_document_id = p_source_document and l.link_type = p_link_type
    and t.posted_at is not null and t.cancelled_at is null
$$;
grant execute on function kernel.linked_quantity(uuid, text), kernel.linked_amount(uuid, text) to erp_app;
