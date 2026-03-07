import { Queue, Worker, type Job } from "bullmq";
import { syncSalesforce, syncHubSpot } from "./crm-sync.js";
import { createServiceClient } from "./supabase.js";
import { evaluateBadgesForUser } from "../routes/gamification.js";

const VALKEY_URL = process.env.VALKEY_URL || process.env.REDIS_URL;

function getConnection() {
  if (!VALKEY_URL) return null;
  const url = new URL(VALKEY_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
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
let _gamificationQueue: Queue | null = null;
let _audioQueue: Queue | null = null;

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

export function getGamificationQueue(): Queue | null {
  const connection = getConnection();
  if (!connection) return null;
  if (!_gamificationQueue) _gamificationQueue = new Queue("gamification", { connection, defaultJobOptions });
  return _gamificationQueue;
}

export function getAudioQueue(): Queue | null {
  const connection = getConnection();
  if (!connection) return null;
  if (!_audioQueue) _audioQueue = new Queue("audio", { connection, defaultJobOptions });
  return _audioQueue;
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
      if (job.name === "weekly-report") {
        console.log("[reports] Generating weekly team reports");

        const sb = createServiceClient();

        // Get all orgs with active users this week
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const { data: orgs } = await sb
          .from("organizations")
          .select("id, name");

        for (const org of orgs ?? []) {
          // Count sessions this week
          const { count: weekSessions } = await sb
            .from("sessions")
            .select("*", { count: "exact", head: true })
            .gte("started_at", oneWeekAgo.toISOString());

          console.log(`[reports] Org ${org.name}: ${weekSessions ?? 0} sessions this week`);

          // Slack webhook if configured (placeholder)
          const slackWebhook = process.env.SLACK_WEBHOOK_URL;
          if (slackWebhook && (weekSessions ?? 0) > 0) {
            await fetch(slackWebhook, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: `Weekly MaximaCoach Report for ${org.name}: ${weekSessions} training sessions completed this week.`,
              }),
            }).catch((err) => console.error(`[reports] Slack webhook failed:`, err));
          }
        }
      } else if (job.name === "refresh-leaderboards") {
        console.log("[reports] Refreshing leaderboard materialized views");

        const sb = createServiceClient();

        const views = [
          "leaderboard_top_score",
          "leaderboard_most_improved",
          "leaderboard_consistency",
          "leaderboard_streak",
        ];

        for (const view of views) {
          try {
            const { error } = await sb.rpc("refresh_materialized_view", { view_name: view });
            if (error) {
              console.warn(`[reports] Could not refresh ${view}:`, error);
            }
          } catch {
            console.warn(`[reports] RPC not available for ${view}, skipping`);
          }
        }

        console.log("[reports] Leaderboard views refreshed");
      } else {
        console.log(`[reports] Processing job ${job.id}`, job.data);
      }
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

  const gamificationWorker = new Worker(
    "gamification",
    async (job: Job) => {
      const supabase = createServiceClient();

      if (job.name === "streak-reset") {
        // Nightly streak reset: find users whose midnight has passed
        // without a practice session today (in their timezone)
        console.log("[gamification] Running nightly streak reset");

        const { data: users } = await supabase
          .from("users")
          .select("id, current_streak, longest_streak, last_practice_date, timezone")
          .gt("current_streak", 0);

        if (!users) return;

        let resetCount = 0;
        for (const user of users) {
          const tz = user.timezone || "America/New_York";
          // Get today's date in user's timezone
          const userNow = new Date().toLocaleDateString("en-CA", { timeZone: tz });
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const userYesterday = yesterday.toLocaleDateString("en-CA", { timeZone: tz });

          // If last practice was before yesterday (in their timezone), reset streak
          if (user.last_practice_date && user.last_practice_date < userYesterday) {
            await supabase
              .from("users")
              .update({ current_streak: 0 })
              .eq("id", user.id);

            // Send streak warning push notification
            if (user.current_streak >= 3) {
              const { sendPushToUser } = await import("./push.js");
              await sendPushToUser(user.id, {
                title: "Streak Lost!",
                body: `Your ${user.current_streak}-day streak just ended. Start a drill to begin a new one!`,
                url: "/drills",
                tag: "streak-warning",
              }).catch(() => {});
            }

            resetCount++;
          }
        }

        console.log(`[gamification] Reset ${resetCount} streaks out of ${users.length} active`);
      } else if (job.name === "badge-evaluation") {
        const { user_id } = job.data as { user_id: string };
        console.log(`[gamification] Evaluating badges for user ${user_id}`);
        const result = await evaluateBadgesForUser(user_id);
        console.log(`[gamification] Awarded ${result.new_badges.length} new badges to ${user_id}`);
      } else if (job.name === "transcript-analysis") {
        const { transcript_id, user_id, org_id } = job.data as {
          transcript_id: string;
          user_id: string;
          org_id: string;
        };
        console.log(`[gamification] Analyzing transcript ${transcript_id}`);

        try {
          // Mark as processing
          await supabase
            .from("call_transcripts")
            .update({ status: "processing" })
            .eq("id", transcript_id);

          // Get transcript text
          const { data: transcript } = await supabase
            .from("call_transcripts")
            .select("raw_text")
            .eq("id", transcript_id)
            .single();

          if (!transcript) throw new Error("Transcript not found");

          // Analyze with AI SDK
          const { generateText } = await import("ai");
          const { openai } = await import("@ai-sdk/openai");

          const result = await generateText({
            model: openai("gpt-4o"),
            system: `You are a sales coaching AI. Analyze this sales call transcript and return JSON with:
{
  "summary": "2-3 sentence summary of the call",
  "strengths": [{"skill": "category_slug", "description": "what was done well", "example_quote": "direct quote"}],
  "weaknesses": [{"skill": "category_slug", "description": "area for improvement", "example_quote": "direct quote"}],
  "overall_rating": 0-100,
  "talk_ratio": 0.0-1.0 (rep talk time / total),
  "key_moments": [{"timestamp": "approximate time", "type": "positive|negative|neutral", "description": "what happened"}]
}
Skill categories: rapport, discovery, objection, closing, value_prop, active_listening.
Respond ONLY with valid JSON.`,
            prompt: transcript.raw_text,
            temperature: 0.3,
          });

          const analysis = JSON.parse(result.text);

          await supabase
            .from("call_transcripts")
            .update({ status: "analyzed", analysis })
            .eq("id", transcript_id);

          console.log(`[gamification] Transcript ${transcript_id} analyzed successfully`);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          await supabase
            .from("call_transcripts")
            .update({ status: "failed", error_message: message })
            .eq("id", transcript_id);
          throw err;
        }
      } else if (job.name === "generate-daily-plans") {
        // Generate daily training plans for all active users
        console.log("[gamification] Generating daily training plans");

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const planDate = tomorrow.toISOString().split("T")[0];

        // Get all active users (practiced in last 14 days)
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

        const { data: activeUsers } = await supabase
          .from("users")
          .select("id")
          .gte("last_practice_date", twoWeeksAgo.toISOString().split("T")[0]);

        if (!activeUsers) return;

        let generated = 0;
        for (const user of activeUsers) {
          // Check if plan already exists
          const { data: existing } = await supabase
            .from("daily_training_plans")
            .select("id")
            .eq("user_id", user.id)
            .eq("plan_date", planDate)
            .single();

          if (existing) continue;

          // Trigger plan generation via API logic (imported at runtime)
          // For now, create a simple 3-drill random plan
          const { data: drills } = await supabase
            .from("drills")
            .select("id, title, difficulty, skill_categories(name)")
            .eq("is_system", true)
            .limit(20);

          if (!drills || drills.length === 0) continue;

          // Pick 3 random drills
          const shuffled = drills.sort(() => Math.random() - 0.5).slice(0, 3);
          const planDrills = shuffled.map((d) => ({
            drill_id: d.id,
            title: d.title,
            skill_category: ((d.skill_categories as unknown as { name: string }) ?? { name: "General" }).name,
            difficulty: d.difficulty,
            status: "pending",
            completed_at: null,
            xp_earned: 0,
          }));

          const { data: userData } = await supabase
            .from("users")
            .select("org_id")
            .eq("id", user.id)
            .single();

          if (!userData?.org_id) continue;

          await supabase.from("daily_training_plans").insert({
            user_id: user.id,
            org_id: userData.org_id,
            plan_date: planDate,
            status: "pending",
            drills: planDrills,
          });

          generated++;
        }

        console.log(`[gamification] Generated ${generated} daily plans for ${planDate}`);
      }
    },
    { connection },
  );

  const audioWorker = new Worker(
    "audio",
    async (job: Job) => {
      if (job.name === "compress-session-audio") {
        const { session_id, user_id, org_id, storage_path } = job.data as {
          session_id: string;
          user_id: string;
          org_id: string;
          storage_path: string;
        };
        console.log(`[audio] Compressing audio for session ${session_id}`);

        const sb = createServiceClient();

        // Download raw PCM from storage
        const { data: pcmData, error: dlError } = await sb.storage
          .from("audio")
          .download(storage_path);

        if (dlError || !pcmData) {
          console.error(`[audio] Failed to download ${storage_path}:`, dlError);
          return;
        }

        const pcmBuffer = Buffer.from(await pcmData.arrayBuffer());
        const originalSize = pcmBuffer.length;

        // Compress to Opus
        const { compressPcmToOpus } = await import("./audio-compress.js");
        const opusBuffer = await compressPcmToOpus(pcmBuffer);

        // Calculate duration: PCM is 16-bit mono 16kHz = 32000 bytes/sec
        const durationSeconds = Math.round(originalSize / 32000);

        // Upload compressed file
        const compressedPath = storage_path.replace(/\.pcm$/, ".ogg");
        const { error: uploadError } = await sb.storage
          .from("audio")
          .upload(compressedPath, opusBuffer, {
            contentType: "audio/ogg",
            upsert: true,
          });

        if (uploadError) {
          console.error(`[audio] Upload failed:`, uploadError);
          return;
        }

        // Record in database
        await sb.from("audio_recordings").insert({
          session_id,
          user_id,
          org_id,
          format: "opus",
          storage_path: compressedPath,
          duration_seconds: durationSeconds,
          file_size_bytes: opusBuffer.length,
          original_size_bytes: originalSize,
        });

        // Delete raw PCM to save storage
        await sb.storage.from("audio").remove([storage_path]);

        const ratio = (originalSize / opusBuffer.length).toFixed(1);
        console.log(
          `[audio] Session ${session_id}: ${originalSize} → ${opusBuffer.length} bytes (${ratio}x compression), ${durationSeconds}s`,
        );
      }
    },
    { connection },
  );

  // Register nightly streak reset as a repeatable job (runs every hour,
  // the worker checks each user's timezone to determine if their midnight passed)
  const gamificationQueue = getGamificationQueue();
  if (gamificationQueue) {
    gamificationQueue.upsertJobScheduler(
      "streak-reset-nightly",
      { pattern: "0 * * * *" }, // every hour
      { name: "streak-reset" },
    ).catch((err) => console.error("[gamification] Failed to register streak-reset scheduler:", err));

    gamificationQueue.upsertJobScheduler(
      "daily-plan-generator",
      { pattern: "0 5 * * *" }, // 5 AM UTC daily
      { name: "generate-daily-plans" },
    ).catch((err) => console.error("[gamification] Failed to register daily-plan scheduler:", err));

    // Leaderboard materialized view refresh every 15 minutes
    const reportsQueue2 = getReportsQueue();
    if (reportsQueue2) {
      reportsQueue2.upsertJobScheduler(
        "leaderboard-refresh",
        { pattern: "*/15 * * * *" },
        { name: "refresh-leaderboards" },
      ).catch((err) => console.error("[reports] Failed to register leaderboard refresh:", err));
    }

    // Weekly report generation — Mondays at 6 AM UTC
    const reportsQueue = getReportsQueue();
    if (reportsQueue) {
      reportsQueue.upsertJobScheduler(
        "weekly-team-report",
        { pattern: "0 6 * * 1" },
        { name: "weekly-report" },
      ).catch((err) => console.error("[reports] Failed to register weekly report scheduler:", err));
    }
  }

  crmWorker.on("failed", (job, err) => {
    console.error(`[crm-sync] Job ${job?.id} failed:`, err.message);
  });

  reportsWorker.on("failed", (job, err) => {
    console.error(`[reports] Job ${job?.id} failed:`, err.message);
  });

  emailWorker.on("failed", (job, err) => {
    console.error(`[email] Job ${job?.id} failed:`, err.message);
  });

  gamificationWorker.on("failed", (job, err) => {
    console.error(`[gamification] Job ${job?.id} failed:`, err.message);
  });

  audioWorker.on("failed", (job, err) => {
    console.error(`[audio] Job ${job?.id} failed:`, err.message);
  });

  const workers = [crmWorker, reportsWorker, emailWorker, gamificationWorker, audioWorker];
  _activeWorkers = workers;

  console.log("[workers] BullMQ workers started: crm-sync, reports, email, gamification, audio");

  return { crmWorker, reportsWorker, emailWorker, gamificationWorker, audioWorker };
}

let _activeWorkers: Worker[] = [];

export async function stopWorkers() {
  if (_activeWorkers.length === 0) return;
  console.log("[workers] Gracefully shutting down BullMQ workers...");
  await Promise.all(_activeWorkers.map((w) => w.close()));
  _activeWorkers = [];
  console.log("[workers] All workers stopped");
}

// ── Health check ──────────────────────────────────────────────

export async function getQueueHealth() {
  const crm = getCrmSyncQueue();
  const reports = getReportsQueue();
  const email = getEmailQueue();
  const gamification = getGamificationQueue();
  const audio = getAudioQueue();

  if (!crm || !reports || !email) {
    return { status: "disabled", reason: "No Redis/Valkey configured" };
  }

  const [crmCounts, reportCounts, emailCounts, gamificationCounts, audioCounts] = await Promise.all([
    crm.getJobCounts("waiting", "active", "failed"),
    reports.getJobCounts("waiting", "active", "failed"),
    email.getJobCounts("waiting", "active", "failed"),
    gamification?.getJobCounts("waiting", "active", "failed") ?? Promise.resolve(null),
    audio?.getJobCounts("waiting", "active", "failed") ?? Promise.resolve(null),
  ]);

  return {
    "crm-sync": crmCounts,
    reports: reportCounts,
    email: emailCounts,
    gamification: gamificationCounts,
    audio: audioCounts,
  };
}
