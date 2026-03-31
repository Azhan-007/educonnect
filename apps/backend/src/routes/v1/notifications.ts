import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
} from "../../services/notification.service";
import {
  registerDeviceToken,
  removeDeviceToken,
  sendToUsers,
  sendToSchool,
} from "../../services/push-notification.service";
import { sendSuccess } from "../../utils/response";
import { z } from "zod";
import { Errors } from "../../errors";

export default async function notificationRoutes(server: FastifyInstance) {
  const authChain = [authenticate, tenantGuard];

  // -----------------------------------------------------------------------
  // GET /notifications — list notifications for the current user
  // -----------------------------------------------------------------------
  server.get(
    "/notifications",
    { preHandler: authChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;
      const userId = request.user!.uid;
      const query = request.query as Record<string, string>;
      const limit = Math.min(parseInt(query.limit) || 50, 200);
      const unreadOnly = query.unreadOnly === "true";

      const notifications = await getNotifications(schoolId, userId, {
        limit,
        unreadOnly,
      });

      return sendSuccess(request, reply, {
        notifications,
        count: notifications.length,
      });
    }
  );

  // -----------------------------------------------------------------------
  // GET /notifications/unread-count — get unread notification count
  // -----------------------------------------------------------------------
  server.get(
    "/notifications/unread-count",
    { preHandler: authChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;
      const userId = request.user!.uid;

      const count = await getUnreadCount(schoolId, userId);

      return sendSuccess(request, reply, { unreadCount: count });
    }
  );

  // -----------------------------------------------------------------------
  // PATCH /notifications/:id/read — mark a notification as read
  // -----------------------------------------------------------------------
  server.patch<{ Params: { id: string } }>(
    "/notifications/:id/read",
    { preHandler: authChain },
    async (request, reply) => {
      const userId = request.user!.uid;
      const { id } = request.params;

      const success = await markAsRead(id, userId);

      if (!success) {
        return reply.status(404).send({
          success: false,
          error: {
            code: "NOTIFICATION_NOT_FOUND",
            message: "Notification not found or not accessible",
          },
        });
      }

      return sendSuccess(request, reply, { marked: true });
    }
  );

  // -----------------------------------------------------------------------
  // POST /notifications/read-all — mark all notifications as read
  // -----------------------------------------------------------------------
  server.post(
    "/notifications/read-all",
    { preHandler: authChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;
      const userId = request.user!.uid;

      const count = await markAllAsRead(schoolId, userId);

      return sendSuccess(request, reply, { markedCount: count });
    }
  );

  // =======================================================================
  // Push Notification Routes (FCM)
  // =======================================================================

  const registerTokenSchema = z.object({
    token: z.string().min(1),
    platform: z.enum(["web", "android", "ios"]),
    deviceInfo: z.string().optional(),
  });

  // -----------------------------------------------------------------------
  // POST /notifications/push/register — register a device token
  // -----------------------------------------------------------------------
  server.post(
    "/notifications/push/register",
    { preHandler: authChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;
      const userId = request.user!.uid;
      const parsed = registerTokenSchema.safeParse(request.body);

      if (!parsed.success) {
        throw Errors.validation(parsed.error.format());
      }

      const deviceToken = await registerDeviceToken({
        userId,
        schoolId,
        token: parsed.data.token,
        platform: parsed.data.platform,
        deviceInfo: parsed.data.deviceInfo,
      });

      return sendSuccess(request, reply, deviceToken);
    }
  );

  // -----------------------------------------------------------------------
  // DELETE /notifications/push/unregister — remove a device token
  // -----------------------------------------------------------------------
  server.delete(
    "/notifications/push/unregister",
    { preHandler: authChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { token?: string };
      if (!body?.token) throw Errors.badRequest("token is required");

      await removeDeviceToken(body.token);
      return sendSuccess(request, reply, { removed: true });
    }
  );

  const sendPushSchema = z.object({
    title: z.string().min(1).max(100),
    body: z.string().min(1).max(500),
    imageUrl: z.string().url().optional(),
    actionUrl: z.string().optional(),
    data: z.record(z.string(), z.string()).optional(),
    /** If provided, send only to these users. Otherwise broadcast to entire school */
    userIds: z.array(z.string()).optional(),
  });

  // -----------------------------------------------------------------------
  // POST /notifications/push/send — send a push notification (admin only)
  // -----------------------------------------------------------------------
  server.post(
    "/notifications/push/send",
    { preHandler: [...authChain, roleMiddleware(["Admin", "SuperAdmin", "Principal"])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;
      const parsed = sendPushSchema.safeParse(request.body);

      if (!parsed.success) {
        throw Errors.validation(parsed.error.format());
      }

      const { userIds, ...payload } = parsed.data;

      if (userIds && userIds.length > 0) {
        // Send to specific users
        const result = await sendToUsers(userIds, payload);
        return sendSuccess(request, reply, result);
      } else {
        // Broadcast to entire school via topic
        const messageId = await sendToSchool(schoolId, payload);
        return sendSuccess(request, reply, { messageId, broadcast: true });
      }
    }
  );
}
