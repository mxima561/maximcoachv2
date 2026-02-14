import { Queue, Worker, type Job } from "bullmq";
import { syncSalesforce, syncHubSpot } from "./crm-sync.js";

const VALKEY_URL = process.env.VALKEY_URL || process.env.REDIS_URL;

function getConnection() {
  if (!VALKEY_URL) return null;
  const url = new URL(VALKEY_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
  };
}

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 1000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

// ── Lazy queue accessors ──────────────────────────────────────

let _crmSyncQueue: Queue | null = null;
let _reportsQueue: Queue | null = null;
let _emailQueue: Queue | null = null;

export function getCrmSyncQueue(): Queue | null {
  const connection = getConnection();
  if (!connection) return null;
  if (!_crmSyncQueue) _crmSyncQueue = new Queue("crm-sync", { connection, defaultJobOptions });
  return _crmSyncQueue;
}

export function getReportsQueue(): Queue | null {
  const connection = getConnection();
  if (!connection) return null;
  if (!_reportsQueue) _reportsQueue = new Queue("reports", { connection, defaultJobOptions });
  return _reportsQueue;
}

export function getEmailQueue(): Queue | null {
  const connection = getConnection();
  if (!connection) return null;
  if (!_emailQueue) _emailQueue = new Queue("email", { connection, defaultJobOptions });
  return _emailQueue;
}

// ── Workers ───────────────────────────────────────────────────

export function startWorkers() {
  const connection = getConnection();
  if (!connection) {
    console.log("[workers] No VALKEY_URL/REDIS_URL configured — BullMQ workers disabled");
    return null;
  }

  const crmWorker = new Worker(
    "crm-sync",
    async (job: Job) => {
      const { org_id, provider } = job.data as {
        org_id: string;
        provider: string;
      };
      console.log(`[crm-sync] Syncing ${provider} for org ${org_id}`);

      if (provider === "salesforce") {
        const result = await syncSalesforce(org_id);
        console.log(`[crm-sync] Salesforce: synced ${result.synced} records`);
      } else if (provider === "hubspot") {
        const result = await syncHubSpot(org_id);
        console.log(`[crm-sync] HubSpot: synced ${result.synced} records`);
      } else {
        console.warn(`[crm-sync] Unknown provider: ${provider}`);
      }
    },
    { connection },
  );

  const reportsWorker = new Worker(
    "reports",
    async (job: Job) => {
      console.log(`[reports] Processing job ${job.id}`, job.data);
    },
    { connection },
  );

  const emailWorker = new Worker(
    "email",
    async (job: Job) => {
      console.log(`[email] Processing job ${job.id}`, job.data);
    },
    { connection },
  );

  crmWorker.on("failed", (job, err) => {
    console.error(`[crm-sync] Job ${job?.id} failed:`, err.message);
  });

  reportsWorker.on("failed", (job, err) => {
    console.error(`[reports] Job ${job?.id} failed:`, err.message);
  });

  emailWorker.on("failed", (job, err) => {
    console.error(`[email] Job ${job?.id} failed:`, err.message);
  });

  console.log("[workers] BullMQ workers started: crm-sync, reports, email");

  return { crmWorker, reportsWorker, emailWorker };
}

// ── Health check ──────────────────────────────────────────────

export async function getQueueHealth() {
  const crm = getCrmSyncQueue();
  const reports = getReportsQueue();
  const email = getEmailQueue();

  if (!crm || !reports || !email) {
    return { status: "disabled", reason: "No Redis/Valkey configured" };
  }

  const [crmCounts, reportCounts, emailCounts] = await Promise.all([
    crm.getJobCounts("waiting", "active", "failed"),
    reports.getJobCounts("waiting", "active", "failed"),
    email.getJobCounts("waiting", "active", "failed"),
  ]);

  return {
    "crm-sync": crmCounts,
    reports: reportCounts,
    email: emailCounts,
  };
}
