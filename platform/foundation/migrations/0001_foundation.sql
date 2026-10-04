-- L1 Business foundation (Step 3 §2, Step 8 §5.2, ADR-0013 party with roles, ADR-0049 conventions).
-- Country rules (GSTIN, HSN, UQC) are NOT here: localization packs plug them in (ADR-0002).
create schema foundation;
grant usage on schema foundation to erp_app;

-- ISO 4217 currencies: global reference data (no tenant).
create table foundation.currency (
  code char(3) primary key check (code ~ '^[A-Z]{3}$'),
  name text not null,
  minor_unit integer not null check (minor_unit between 0 and 4),
  symbol text
);
grant select on foundation.currency to erp_app;
insert into foundation.currency (code, name, minor_unit, symbol) values
  ('INR', 'Indian Rupee', 2, '₹'), ('USD', 'US Dollar', 2, '$'), ('EUR', 'Euro', 2, '€'), ('GBP', 'Pound Sterling', 2, '£'),
  ('AED', 'UAE Dirham', 2, 'AED'), ('SAR', 'Saudi Riyal', 2, 'SAR'), ('QAR', 'Qatari Riyal', 2, 'QAR'), ('OMR', 'Rial Omani', 3, 'OMR'),
  ('KWD', 'Kuwaiti Dinar', 3, 'KWD'), ('BHD', 'Bahraini Dinar', 3, 'BHD'), ('SGD', 'Singapore Dollar', 2, 'S$'), ('JPY', 'Yen', 0, '¥'),
  ('CNY', 'Yuan Renminbi', 2, 'CN¥'), ('AUD', 'Australian Dollar', 2, 'A$'), ('CAD', 'Canadian Dollar', 2, 'C$'), ('CHF', 'Swiss Franc', 2, 'CHF'),
  ('BDT', 'Taka', 2, '৳'), ('LKR', 'Sri Lanka Rupee', 2, 'Rs'), ('NPR', 'Nepalese Rupee', 2, 'Rs');

-- Helper: standard tenant table setup (RLS, grants, version bump, audit).
create function foundation.setup_tenant_table(t regclass, audit boolean default true, touch boolean default true) returns void language plpgsql as $$
begin
  execute format('alter table %s enable row level security', t);
  execute format('create policy tenant_isolation on %s using (tenant_id = kernel.current_tenant()) with check (tenant_id = kernel.current_tenant())', t);
  execute format('grant select, insert, update, delete on %s to erp_app', t);
  if touch then
    execute format('create trigger touch before update on %s for each row execute function kernel.touch_row()', t);
  end if;
  if audit then
    perform kernel.enable_audit(t);
  end if;
end $$;

-- Units of measure. code is the tenant's short name ("kg", "sheet"); unece = UN/ECE Rec 20; uqc = GST UQC.
create table foundation.uom (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  code text not null check (code ~ '^[a-z0-9_]{1,16}$'),
  name text not null,
  dimension text not null check (dimension in ('mass', 'count', 'length', 'area', 'volume', 'time', 'other')),
  decimals integer not null default 0 check (decimals between 0 and 6),
  unece text,
  uqc text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  unique (tenant_id, code)
);
select foundation.setup_tenant_table('foundation.uom');

create table foundation.tax_category (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  code text not null check (code ~ '^[a-z0-9_]{1,30}$'),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  unique (tenant_id, code)
);
select foundation.setup_tenant_table('foundation.tax_category');

-- Rates by tax type, effective-dated (rate changes keep history).
create table foundation.tax_rate (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  tax_category_id uuid not null references foundation.tax_category (id),
  tax_type text not null check (tax_type ~ '^[a-z][a-z0-9_]{0,20}$'), -- e.g. "gst", "cess"
  rate numeric(7, 4) not null check (rate >= 0 and rate <= 100),
  valid_from date not null,
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  unique (tax_category_id, tax_type, valid_from)
);
select foundation.setup_tenant_table('foundation.tax_rate', true, false);

create table foundation.item_category (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  code text not null check (code ~ '^[a-z0-9_]{1,30}$'),
  name text not null,
  parent_id uuid references foundation.item_category (id),
  item_type text not null default 'stock' check (item_type in ('stock', 'non_stock', 'service')),
  default_uom_id uuid references foundation.uom (id),
  default_tax_category_id uuid references foundation.tax_category (id),
  default_hsn_sac text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  unique (tenant_id, code)
);
select foundation.setup_tenant_table('foundation.item_category');

-- Party (ADR-0013): one master for customers, vendors, transporters, job workers.
create table foundation.party (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,29}$'),
  name text not null check (length(name) between 1 and 200),
  legal_name text,
  kind text not null default 'organisation' check (kind in ('organisation', 'individual')),
  status text not null default 'active' check (status in ('active', 'blocked', 'archived')),
  default_currency char(3) not null default 'INR' references foundation.currency (code),
  ext jsonb not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  unique (tenant_id, code)
);
create index party_name on foundation.party (tenant_id, lower(name));
select foundation.setup_tenant_table('foundation.party');

create table foundation.party_role (
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  party_id uuid not null references foundation.party (id) on delete cascade,
  role text not null check (role in ('customer', 'vendor', 'transporter', 'job_worker')),
  created_at timestamptz not null default now(),
  primary key (party_id, role)
);
select foundation.setup_tenant_table('foundation.party_role', true, false);

create table foundation.party_address (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  party_id uuid not null references foundation.party (id) on delete cascade,
  kind text not null check (kind in ('registered', 'billing', 'shipping', 'works')),
  label text,
  line1 text not null,
  line2 text,
  city text not null,
  district text,
  region_code text not null check (region_code ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'), -- ISO 3166-2, e.g. IN-MH
  postal_code text,
  country char(2) not null default 'IN' check (country ~ '^[A-Z]{2}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1
);
create index party_address_party on foundation.party_address (tenant_id, party_id);
select foundation.setup_tenant_table('foundation.party_address');

-- Tax identifiers (PAN, GSTIN per state registration, VAT …). Unique per tenant: one GSTIN, one party.
create table foundation.party_tax_id (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  party_id uuid not null references foundation.party (id) on delete cascade,
  scheme text not null check (scheme ~ '^[a-z][a-z0-9_]{1,15}$'), -- "pan", "gstin", "vat" …
  value text not null,
  region_code text,
  address_id uuid references foundation.party_address (id) on delete set null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  unique (tenant_id, scheme, value)
);
create index party_tax_id_party on foundation.party_tax_id (tenant_id, party_id);
select foundation.setup_tenant_table('foundation.party_tax_id', true, false);

-- Contacts hold personal data (DPDP): classified "personal" in metadata, masked in exports.
create table foundation.party_contact (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  party_id uuid not null references foundation.party (id) on delete cascade,
  name text not null,
  designation text,
  phone text,
  email text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1
);
select foundation.setup_tenant_table('foundation.party_contact');

-- Item core (facets for sales, purchase, inventory … are owned by those modules later).
create table foundation.item (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'),
  name text not null check (length(name) between 1 and 200),
  description text,
  category_id uuid not null references foundation.item_category (id),
  item_type text not null check (item_type in ('stock', 'non_stock', 'service')),
  base_uom_id uuid not null references foundation.uom (id),
  hsn_sac text,
  tax_category_id uuid references foundation.tax_category (id),
  owner_party_id uuid references foundation.party (id), -- customer-specific product (ADR-0018)
  status text not null default 'active' check (status in ('active', 'blocked', 'archived')),
  ext jsonb not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  unique (tenant_id, code)
);
create index item_by_category on foundation.item (tenant_id, category_id);
create index item_name on foundation.item (tenant_id, lower(name));
select foundation.setup_tenant_table('foundation.item');

-- 1 <from> = factor <to>. item_id null = general conversion (1 ream = 500 sheets); else item-specific (1 kg = 6.8 sheets).
create table foundation.uom_conversion (
  id uuid primary key default kernel.uuid_v7(),
  tenant_id uuid not null default kernel.current_tenant() references kernel.tenant (id),
  item_id uuid references foundation.item (id) on delete cascade,
  from_uom_id uuid not null references foundation.uom (id),
  to_uom_id uuid not null references foundation.uom (id),
  factor numeric(24, 10) not null check (factor > 0),
  created_at timestamptz not null default now(),
  created_by uuid default kernel.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  check (from_uom_id <> to_uom_id)
);
create unique index uom_conversion_unique on foundation.uom_conversion
  (tenant_id, coalesce(item_id, '00000000-0000-0000-0000-000000000000'), from_uom_id, to_uom_id);
select foundation.setup_tenant_table('foundation.uom_conversion');
