import cron, { type ScheduledTask } from "node-cron";
import pino from "pino";
import {
  processExpiredTrials,
  processOverdueSubscriptions,
  processExpiredGrace,
} from "../services/subscription.service";
import { firestore } from "../lib/firebase-admin";
import { trackError } from "../services/error-tracking.service";
import {
  trialExpiringEmail,
  usageLimitWarningEmail,
} from "../services/email-templates";
import { enqueueEmail, initEmailQueue, shutdownEmailQueue } from "../services/email-queue.service";

const log = pino({ name: "workers" });

/**
 * Background workers that run on a schedule.
 *
 * All workers are idempotent and safe to run on multiple instances
 * (each transition uses Firestore's atomic updates).
 *
 * Schedule (node-cron syntax):
 *   ┌──────── minute (0–59)
 *   │ ┌────── hour (0–23)
 *   │ │ ┌──── day of month (1–31)
 *   │ │ │ ┌── month (1–12)
 *   │ │ │ │ ┌ day of week (0–7, 0 or 7 = Sunday)
 *   │ │ │ │ │
 *   * * * * *
 */

let started = false;
const tasks: ScheduledTask[] = [];

export function startWorkers(): void {
  if (started) return;
  started = true;

  void initEmailQueue();

  log.info("[workers] Starting background workers...");

  // ── Trial Expiry Check ─────────────────────────────────────────────────
  // Every hour at minute 0
  tasks.push(cron.schedule("0 * * * *", async () => {
    try {
      const count = await processExpiredTrials();
      if (count > 0) {
        log.info(`[workers] Expired ${count} trial(s)`);
      }
    } catch (err) {
      log.error({ err }, "Trial expiry worker failed");
      trackError({ error: err, metadata: { context: "worker:trial-expiry" } });
    }
  }));

  // ── Overdue Subscriptions ──────────────────────────────────────────────
  // Every hour at minute 15
  tasks.push(cron.schedule("15 * * * *", async () => {
    try {
      const count = await processOverdueSubscriptions();
      if (count > 0) {
        log.info(`[workers] Moved ${count} subscription(s) to past_due`);
      }
    } catch (err) {
      log.error({ err }, "Overdue subscriptions worker failed");
      trackError({ error: err, metadata: { context: "worker:overdue-subscriptions" } });
    }
  }));

  // ── Grace Period Expiry ────────────────────────────────────────────────
  // Every hour at minute 30
  tasks.push(cron.schedule("30 * * * *", async () => {
    try {
      const count = await processExpiredGrace();
      if (count > 0) {
        log.info(`[workers] Expired ${count} past_due subscription(s) after grace period`);
      }
    } catch (err) {
      log.error({ err }, "Grace period expiry worker failed");
      trackError({ error: err, metadata: { context: "worker:grace-expiry" } });
    }
  }));

  // ── Daily Usage Snapshot ───────────────────────────────────────────────
  // Every day at 2:00 AM
  tasks.push(cron.schedule("0 2 * * *", async () => {
    try {
      await captureUsageSnapshots();
    } catch (err) {
      log.error({ err }, "Usage snapshot worker failed");
      trackError({ error: err, metadata: { context: "worker:usage-snapshot" } });
    }
  }));

  // ── Trial Expiry Email Reminders ───────────────────────────────────────
  // Every day at 9:00 AM — send reminders at day 7 and day 12 of trial
  tasks.push(cron.schedule("0 9 * * *", async () => {
    try {
      await sendTrialExpiryReminders();
    } catch (err) {
      log.error({ err }, "Trial reminder worker failed");
      trackError({ error: err, metadata: { context: "worker:trial-reminders" } });
    }
  }));

  // ── Usage Limit Warnings ──────────────────────────────────────────────
  // Every day at 10:00 AM — warn schools nearing plan limits
  tasks.push(cron.schedule("0 10 * * *", async () => {
    try {
      await sendUsageLimitWarnings();
    } catch (err) {
      log.error({ err }, "Usage limit warning worker failed");
      trackError({ error: err, metadata: { context: "worker:usage-limits" } });
    }
  }));

  log.info("[workers] All background workers scheduled");
}

/** Stop all scheduled cron tasks (called during graceful shutdown). */
export function stopWorkers(): void {
  tasks.forEach((t) => t.stop());
  tasks.length = 0;
  void shutdownEmailQueue();
  started = false;
  log.info("[workers] All background workers stopped");
}

/**
 * Capture daily usage snapshots for all active schools.
 * Useful for usage analytics and limit enforcement history.
 */
async function captureUsageSnapshots(): Promise<void> {

  const snapshot = await firestore
    .collection("schools")
    .where("isActive", "==", true)
    .get();

  let count = 0;
  let batch = firestore.batch();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const snapshotRef = firestore.collection("usageSnapshots").doc();

    batch.set(snapshotRef, {
      id: snapshotRef.id,
      schoolId: doc.id,
      date: new Date().toISOString().split("T")[0],
      students: data.currentStudents ?? 0,
      teachers: data.currentTeachers ?? 0,
      storage: data.currentStorage ?? 0,
      plan: data.subscriptionPlan ?? "free",
      maxStudents: data.maxStudents ?? 0,
      maxTeachers: data.maxTeachers ?? 0,
      maxStorage: data.maxStorage ?? 0,
      createdAt: new Date().toISOString(),
    });

    count++;

    // Firestore batch limit is 500 — commit and start a fresh batch
    if (count % 450 === 0) {
      await batch.commit();
      batch = firestore.batch();
    }
  }

  if (count % 450 !== 0) {
    await batch.commit();
  }

  log.info(`Captured usage snapshots for ${count} school(s)`);
}

// ---------------------------------------------------------------------------
// Trial expiry email reminders
// ---------------------------------------------------------------------------

/**
 * Send email reminders to schools whose trial is about to expire.
 * Sends at 7 days remaining and 2 days remaining.
 */
async function sendTrialExpiryReminders(): Promise<void> {
  const today = new Date();

  // Check for trials expiring in 7 days and 2 days
  for (const daysAhead of [7, 2]) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + daysAhead);
    const targetStr = targetDate.toISOString().split("T")[0];

    const snapshot = await firestore
      .collection("schools")
      .where("subscriptionStatus", "==", "trial")
      .where("trialEndDate", "==", targetStr)
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const schoolName = (data.name as string) ?? "Your School";
      const adminEmail = data.email as string;

      if (!adminEmail) continue;

      const template = trialExpiringEmail(schoolName, daysAhead);
      await enqueueEmail({
        to: adminEmail,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });
    }

    if (snapshot.size > 0) {
      log.info(`[workers] Sent ${snapshot.size} trial expiry reminder(s) (${daysAhead} days ahead)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Usage limit warnings
// ---------------------------------------------------------------------------

/**
 * Warn schools that have used ≥ 80% of any plan limit.
 * Sends at most one warning per school per day.
 */
async function sendUsageLimitWarnings(): Promise<void> {
  const snapshot = await firestore
    .collection("schools")
    .where("subscriptionStatus", "in", ["active", "trial"])
    .get();

  let sent = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const schoolName = (data.name as string) ?? "School";
    const adminEmail = data.email as string;
    const limits = data.limits as Record<string, number> | undefined;

    if (!adminEmail || !limits) continue;

    // Count current usage
    const [studentCount, teacherCount] = await Promise.all([
      firestore
        .collection("students")
        .where("schoolId", "==", doc.id)
        .where("isDeleted", "==", false)
        .count().get().then((s) => s.data().count),
      firestore
        .collection("teachers")
        .where("schoolId", "==", doc.id)
        .where("isDeleted", "==", false)
        .count().get().then((s) => s.data().count),
    ]);

    const checks = [
      { resource: "Students", current: studentCount, limit: limits.maxStudents ?? limits.students },
      { resource: "Teachers", current: teacherCount, limit: limits.maxTeachers },
    ];

    for (const check of checks) {
      if (!check.limit || check.limit === -1) continue;

      const usage = check.current / check.limit;
      if (usage >= 0.8) {
        const template = usageLimitWarningEmail(
          schoolName,
          check.resource,
          check.current,
          check.limit
        );
        await enqueueEmail({
          to: adminEmail,
          subject: template.subject,
          html: template.html,
          text: template.text,
        });
        sent++;
      }
    }
  }

  if (sent > 0) {
    log.info(`[workers] Sent ${sent} usage limit warning(s)`);
  }
}
