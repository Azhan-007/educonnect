import pino from "pino";
import { prisma } from "../lib/prisma";

const log = pino({ name: "notification" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | "info"
  | "warning"
  | "error"
  | "success"
  | "payment"
  | "subscription"
  | "system";

export interface CreateNotificationInput {
  schoolId: string;
  recipientIds?: string[];
  title: string;
  message: string;
  type: NotificationType;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// In-app notifications
// ---------------------------------------------------------------------------

export async function createNotification(input: CreateNotificationInput) {
  // For broadcast (no specific userId), set userId to null
  const userId = input.recipientIds?.[0] ?? null;

  const notification = await prisma.notification.create({
    data: {
      schoolId: input.schoolId,
      userId,
      title: input.title,
      message: input.message,
      type: input.type,
      severity: "info",
      actionUrl: input.actionUrl,
      data: input.metadata ? (input.metadata as any) : undefined,
      isRead: false,
    },
  });

  return notification;
}

export async function getNotifications(
  schoolId: string,
  userId: string,
  options: { limit?: number; unreadOnly?: boolean } = {}
) {
  const limit = options.limit ?? 50;

  const where: any = {
    schoolId,
    OR: [
      { userId },      // Targeted at this user
      { userId: null },  // Broadcast
    ],
  };

  if (options.unreadOnly) {
    where.isRead = false;
  }

  return prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function markAsRead(notificationId: string, _userId: string): Promise<boolean> {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification) return false;

  await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true, readAt: new Date() },
  });

  return true;
}

export async function markAllAsRead(schoolId: string, userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: {
      schoolId,
      isRead: false,
      OR: [{ userId }, { userId: null }],
    },
    data: { isRead: true, readAt: new Date() },
  });

  return result.count;
}

export async function getUnreadCount(schoolId: string, userId: string): Promise<number> {
  return prisma.notification.count({
    where: {
      schoolId,
      isRead: false,
      OR: [{ userId }, { userId: null }],
    },
  });
}

// ---------------------------------------------------------------------------
// Notification templates
// ---------------------------------------------------------------------------

export const NotificationTemplates = {
  paymentReceived: (schoolId: string, amount: number, plan: string) =>
    createNotification({
      schoolId,
      title: "Payment Received",
      message: `Payment of ₹${(amount / 100).toFixed(2)} received for ${plan} plan.`,
      type: "payment",
      actionUrl: "/settings/subscription",
    }),

  trialExpiring: (schoolId: string, daysLeft: number) =>
    createNotification({
      schoolId,
      title: "Trial Expiring Soon",
      message: `Your trial ends in ${daysLeft} day(s). Upgrade now to continue using all features.`,
      type: "warning",
      actionUrl: "/pricing",
    }),

  subscriptionExpired: (schoolId: string) =>
    createNotification({
      schoolId,
      title: "Subscription Expired",
      message: "Your subscription has expired. Please renew to continue using the platform.",
      type: "error",
      actionUrl: "/pricing",
    }),

  subscriptionCancelled: (schoolId: string, effectiveDate: string) =>
    createNotification({
      schoolId,
      title: "Subscription Cancelled",
      message: `Your subscription will be cancelled on ${effectiveDate}. You can reactivate anytime before then.`,
      type: "warning",
      actionUrl: "/settings/subscription",
    }),

  usageLimitWarning: (schoolId: string, resource: string, current: number, limit: number) =>
    createNotification({
      schoolId,
      title: `${resource} Limit Warning`,
      message: `You've used ${current} of ${limit} ${resource.toLowerCase()}. Consider upgrading your plan.`,
      type: "warning",
      actionUrl: "/pricing",
    }),

  systemMaintenance: (schoolId: string, scheduledTime: string) =>
    createNotification({
      schoolId,
      title: "Scheduled Maintenance",
      message: `System maintenance is scheduled for ${scheduledTime}. The platform may be temporarily unavailable.`,
      type: "system",
    }),
};

// ---------------------------------------------------------------------------
// Email (SendGrid)
// ---------------------------------------------------------------------------

import sgMail from "@sendgrid/mail";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@educonnect.app";
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "EduConnect";

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    log.info({ to: payload.to, subject: payload.subject }, "Email dry-run (no SENDGRID_API_KEY)");
    return true;
  }

  try {
    await sgMail.send({
      to: payload.to,
      from: { email: EMAIL_FROM, name: EMAIL_FROM_NAME },
      subject: payload.subject,
      html: payload.html,
      text: payload.text ?? payload.html.replace(/<[^>]*>/g, ""),
    });
    log.info({ to: payload.to, subject: payload.subject }, "Email sent");
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({ to: payload.to, subject: payload.subject, err: message }, "Email send failed");
    return false;
  }
}
