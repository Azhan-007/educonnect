/**
 * Push notification service — Firebase Cloud Messaging (FCM).
 * Device token storage moved to PostgreSQL via Prisma.
 * FCM sending logic remains unchanged (FCM SDK).
 */

import pino from "pino";
import { admin } from "../lib/firebase-admin";
import { prisma } from "../lib/prisma";

const log = pino({ name: "push-notification" });

export interface PushNotificationPayload {
  title: string;
  body: string;
  imageUrl?: string;
  actionUrl?: string;
  data?: Record<string, string>;
}

export interface SendResult { successCount: number; failureCount: number; invalidTokens: string[]; }

// Device token management — Prisma

export async function registerDeviceToken(params: {
  userId: string; schoolId: string; token: string; platform: "web" | "android" | "ios"; deviceInfo?: string;
}) {
  const existing = await prisma.deviceToken.findUnique({ where: { token: params.token } });

  if (existing) {
    await prisma.deviceToken.update({
      where: { token: params.token },
      data: { userId: params.userId, schoolId: params.schoolId, platform: params.platform, deviceInfo: params.deviceInfo },
    });
    return { ...existing, ...params };
  }

  const deviceToken = await prisma.deviceToken.create({
    data: { userId: params.userId, schoolId: params.schoolId, token: params.token, platform: params.platform, deviceInfo: params.deviceInfo },
  });

  try {
    await admin.messaging().subscribeToTopic([params.token], `school_${params.schoolId}`);
  } catch (err) { log.warn({ err }, "Failed to subscribe to school topic"); }

  return deviceToken;
}

export async function removeDeviceToken(token: string): Promise<boolean> {
  const existing = await prisma.deviceToken.findUnique({ where: { token } });
  if (!existing) return false;

  try { await admin.messaging().unsubscribeFromTopic([token], `school_${existing.schoolId}`); } catch (_) {}

  await prisma.deviceToken.delete({ where: { token } });
  return true;
}

export async function getUserTokens(userId: string) {
  return prisma.deviceToken.findMany({ where: { userId } });
}

export async function getSchoolTokens(schoolId: string) {
  return prisma.deviceToken.findMany({ where: { schoolId } });
}

// Send push notifications

export async function sendToUsers(userIds: string[], payload: PushNotificationPayload): Promise<SendResult> {
  const tokens = await prisma.deviceToken.findMany({ where: { userId: { in: userIds } }, select: { token: true } });
  if (tokens.length === 0) return { successCount: 0, failureCount: 0, invalidTokens: [] };
  return sendToTokens(tokens.map((t: { token: string }) => t.token), payload);
}

export async function sendToSchool(schoolId: string, payload: PushNotificationPayload): Promise<string> {
  const message: admin.messaging.Message = {
    topic: `school_${schoolId}`,
    notification: { title: payload.title, body: payload.body, imageUrl: payload.imageUrl },
    data: { ...payload.data, actionUrl: payload.actionUrl ?? "" },
    android: { priority: "high", notification: { channelId: "educonnect_default", clickAction: "FLUTTER_NOTIFICATION_CLICK" } },
    apns: { payload: { aps: { badge: 1, sound: "default" } } },
    webpush: { fcmOptions: { link: payload.actionUrl } },
  };
  return admin.messaging().send(message);
}

async function sendToTokens(tokens: string[], payload: PushNotificationPayload): Promise<SendResult> {
  if (tokens.length === 0) return { successCount: 0, failureCount: 0, invalidTokens: [] };

  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: { title: payload.title, body: payload.body, imageUrl: payload.imageUrl },
    data: { ...payload.data, actionUrl: payload.actionUrl ?? "" },
    android: { priority: "high", notification: { channelId: "educonnect_default", clickAction: "FLUTTER_NOTIFICATION_CLICK" } },
    apns: { payload: { aps: { badge: 1, sound: "default" } } },
  };

  const response = await admin.messaging().sendEachForMulticast(message);
  const invalidTokens: string[] = [];
  response.responses.forEach((res, idx) => {
    if (!res.success) {
      const code = res.error?.code;
      if (code === "messaging/invalid-registration-token" || code === "messaging/registration-token-not-registered") {
        invalidTokens.push(tokens[idx]);
      }
    }
  });

  if (invalidTokens.length > 0) {
    prisma.deviceToken.deleteMany({ where: { token: { in: invalidTokens } } }).catch((err: unknown) => log.error({ err }, "Failed to clean up invalid tokens"));
  }

  return { successCount: response.successCount, failureCount: response.failureCount, invalidTokens };
}

// Push notification templates
export const PushTemplates = {
  attendanceMarked: (name: string, status: "present" | "absent" | "late"): PushNotificationPayload => ({ title: "Attendance Update", body: `${name} has been marked ${status} today.`, data: { type: "attendance" }, actionUrl: "/attendance" }),
  feeReminder: (name: string, amount: number, dueDate: string): PushNotificationPayload => ({ title: "Fee Payment Reminder", body: `Fee of ₹${amount.toLocaleString("en-IN")} for ${name} is due on ${dueDate}.`, data: { type: "fee_reminder" }, actionUrl: "/fees" }),
  feeReceived: (name: string, amount: number): PushNotificationPayload => ({ title: "Payment Received", body: `Payment of ₹${amount.toLocaleString("en-IN")} received for ${name}.`, data: { type: "fee_payment" }, actionUrl: "/fees" }),
  examResult: (name: string, examName: string): PushNotificationPayload => ({ title: "Exam Results Published", body: `Results for ${examName} are now available for ${name}.`, data: { type: "result" }, actionUrl: "/results" }),
  eventAnnouncement: (title: string, date: string): PushNotificationPayload => ({ title: "New Event", body: `${title} scheduled for ${date}. Tap to view details.`, data: { type: "event" }, actionUrl: "/events" }),
  schoolAnnouncement: (title: string, message: string): PushNotificationPayload => ({ title, body: message, data: { type: "announcement" } }),
  subscriptionExpiring: (daysLeft: number): PushNotificationPayload => ({ title: "Subscription Expiring", body: `Your subscription expires in ${daysLeft} day(s). Renew now.`, data: { type: "subscription" }, actionUrl: "/settings/subscription" }),
};
