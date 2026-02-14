import { Queue, Worker, type Job } from "bullmq";

const connection = {
  host: new URL(process.env.VALKEY_URL || "redis://localhost:6379").hostname,
  port: Number(
    new URL(process.env.VALKEY_URL || "redis://localhost:6379").port || 6379,
  ),
};

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 1000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

// ── Queues ────────────────────────────────────────────────────

export const crmSyncQueue = new Queue("crm-sync", {
  connection,
  defaultJobOptions,
});

export const reportsQueue = new Queue("reports", {
  connection,
  defaultJobOptions,
});

export const emailQueue = new Queue("email", {
  connection,
  defaultJobOptions,
});

// ── Workers ───────────────────────────────────────────────────

export function startWorkers() {
  const crmWorker = new Worker(
    "crm-sync",
    async (job: Job) => {
      console.log(`[crm-sync] Processing job ${job.id}`, job.data);
      // Placeholder: CRM sync logic will be implemented in US-046/US-047
    },
    { connection },
  );

  const reportsWorker = new Worker(
    "reports",
    async (job: Job) => {
      console.log(`[reports] Processing job ${job.id}`, job.data);
      // Placeholder: report generation logic
    },
    { connection },
  );

  const emailWorker = new Worker(
    "email",
    async (job: Job) => {
      console.log(`[email] Processing job ${job.id}`, job.data);
      // Placeholder: email sending logic
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
  const [crmCounts, reportCounts, emailCounts] = await Promise.all([
    crmSyncQueue.getJobCounts("waiting", "active", "failed"),
    reportsQueue.getJobCounts("waiting", "active", "failed"),
    emailQueue.getJobCounts("waiting", "active", "failed"),
  ]);

  return {
    "crm-sync": crmCounts,
    reports: reportCounts,
    email: emailCounts,
  };
}
