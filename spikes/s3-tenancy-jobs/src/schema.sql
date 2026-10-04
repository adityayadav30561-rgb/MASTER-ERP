-- Spike S3 schema. Mirrors ADR-0035 (tenant isolation), ADR-0049 (conventions), ADR-0050 (ledgers + locks).
-- Run by the owner role (migrations). The application connects as s3_app, which is subject to RLS.
DROP SCHEMA IF EXISTS s3_kernel CASCADE;
DROP SCHEMA IF EXISTS s3_inventory CASCADE;
CREATE SCHEMA s3_kernel;
CREATE SCHEMA s3_inventory;

-- The current tenant, read from a transaction-local setting. Unset or empty → NULL → no rows (fail closed).
CREATE FUNCTION s3_kernel.current_tenant() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE TABLE s3_kernel.tenant (
  id uuid PRIMARY KEY,
  name text NOT NULL
);

-- Append-only stock ledger: the source of truth (ADR-0050).
CREATE TABLE s3_inventory.stock_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL DEFAULT s3_kernel.current_tenant() REFERENCES s3_kernel.tenant (id),
  item_code text NOT NULL,
  warehouse_code text NOT NULL,
  quantity numeric(24, 6) NOT NULL,
  value numeric(20, 2) NOT NULL,
  document_ref text NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now()
);

-- Derived balance, updated in the same transaction under a row lock.
CREATE TABLE s3_inventory.stock_balance (
  tenant_id uuid NOT NULL DEFAULT s3_kernel.current_tenant() REFERENCES s3_kernel.tenant (id),
  item_code text NOT NULL,
  warehouse_code text NOT NULL,
  quantity numeric(24, 6) NOT NULL DEFAULT 0,
  value numeric(20, 2) NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, item_code, warehouse_code),
  CONSTRAINT stock_not_negative CHECK (quantity >= 0)
);

ALTER TABLE s3_inventory.stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE s3_inventory.stock_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE s3_inventory.stock_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE s3_inventory.stock_balance FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON s3_inventory.stock_ledger
  USING (tenant_id = s3_kernel.current_tenant()) WITH CHECK (tenant_id = s3_kernel.current_tenant());
CREATE POLICY tenant_isolation ON s3_inventory.stock_balance
  USING (tenant_id = s3_kernel.current_tenant()) WITH CHECK (tenant_id = s3_kernel.current_tenant());

-- Posted ledger rows are immutable (ADR-0007): the app may insert and read, never update or delete.
GRANT USAGE ON SCHEMA s3_kernel, s3_inventory TO s3_app;
GRANT SELECT ON s3_kernel.tenant TO s3_app;
GRANT SELECT, INSERT ON s3_inventory.stock_ledger TO s3_app;
GRANT SELECT, INSERT, UPDATE ON s3_inventory.stock_balance TO s3_app;
GRANT EXECUTE ON FUNCTION s3_kernel.current_tenant() TO s3_app;

-- Enqueue a job inside the business transaction. Runs with the owner's rights, so the app role needs
-- no access to the job tables, and the tenant id is taken from the context — it cannot be forged.
CREATE FUNCTION s3_kernel.enqueue_job(task text, payload jsonb, job_key text DEFAULT NULL)
  RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  tenant uuid := s3_kernel.current_tenant();
  job_id bigint;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'enqueue_job: no tenant context' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO job_id FROM graphile_worker.add_job(
    task,
    (payload || jsonb_build_object('tenant_id', tenant))::json,
    job_key => job_key,
    max_attempts => 10
  );
  RETURN job_id;
END $$;
REVOKE ALL ON FUNCTION s3_kernel.enqueue_job(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION s3_kernel.enqueue_job(text, jsonb, text) TO s3_app;
