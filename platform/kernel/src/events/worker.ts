/**
 * The worker process (ADR-0059: same image as web, different start command).
 * It runs as the owner role for the job tables, but every business handler runs through the
 * application pool inside withTenant — so RLS still applies to the work itself.
 */
import { sql } from "kysely";
import { Logger, run } from "graphile-worker";
import type { Runner, TaskList } from "graphile-worker";
import type { AnyDb } from "../db/database.ts";
import { sealAllAuditChains } from "../audit/audit.ts";
import { EVENT_TASK } from "./bus.ts";
import type { CloudEvent, EventBus } from "./bus.ts";

export interface WorkerOptions {
  ownerConnectionString: string;
  ownerDb: AnyDb;
  appDb: AnyDb;
  bus: EventBus;
  concurrency?: number;
  pollInterval?: number;
  /** Extra kernel or module tasks (PDF rendering, integrations, exports …). */
  tasks?: TaskList;
  log?: (level: string, message: string) => void;
}

export async function startWorker(o: WorkerOptions): Promise<Runner> {
  const taskList: TaskList = {
    ...o.tasks,
    [EVENT_TASK]: async (payload) => {
      await o.bus.deliver(o.appDb, payload as { subscriber: string; event: CloudEvent; tenant_id: string });
    },
    kernel_seal_audit: async () => {
      await sealAllAuditChains(o.ownerDb);
    },
  };
  return run({
    connectionString: o.ownerConnectionString,
    concurrency: o.concurrency ?? 4,
    pollInterval: o.pollInterval ?? 2000,
    noHandleSignals: true,
    taskList,
    crontab: "* * * * * kernel_seal_audit ?max=1&jobKey=kernel_seal_audit",
    logger: new Logger(() => (level, message) => o.log?.(level, message)),
  });
}

export interface DeadJob {
  id: string;
  task: string;
  attempts: number;
  last_error: string | null;
  payload: Record<string, unknown>;
}

/** Jobs that used all their attempts (ADR-0041 dead-letter list). Owner connection. */
export async function listDeadJobs(owner: AnyDb): Promise<DeadJob[]> {
  const r = await sql<DeadJob>`select j.id::text as id, t.identifier as task, j.attempts, j.last_error, j.payload
      from graphile_worker._private_jobs j join graphile_worker._private_tasks t on t.id = j.task_id
      where j.attempts >= j.max_attempts order by j.id`.execute(owner);
  return r.rows;
}

/** Replay dead jobs after the cause is fixed. */
export async function retryDeadJobs(owner: AnyDb, jobIds: readonly string[]): Promise<void> {
  await sql`select graphile_worker.reschedule_jobs(${jobIds}::bigint[], run_at := now(), attempts := 0)`.execute(owner);
}
