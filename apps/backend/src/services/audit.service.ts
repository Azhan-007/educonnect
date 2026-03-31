import { prisma } from "../lib/prisma";
import pino from "pino";

const log = pino({ name: "audit" });

/**
 * Write an audit log entry to PostgreSQL.
 *
 * Fire-and-forget — errors are logged but never thrown so that
 * the primary operation is not affected.
 */
export async function writeAuditLog(
  action: string,
  userId: string,
  schoolId: string,
  metadata: Record<string, unknown> = {},
  options?: {
    resource?: string;
    resourceId?: string;
    requestId?: string;
    ipAddress?: string;
    userAgent?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        schoolId,
        userId,
        action,
        resource: options?.resource,
        resourceId: options?.resourceId,
        requestId: options?.requestId,
        ipAddress: options?.ipAddress,
        userAgent: options?.userAgent,
        before: (options?.before ?? undefined) as any,
        after: (options?.after ?? undefined) as any,
        metadata: Object.keys(metadata).length > 0 ? (metadata as any) : undefined,
      },
    });
  } catch (err) {
    log.error({ err, action, schoolId }, "Failed to write audit log");
  }
}

/**
 * Query audit logs for a school.
 */
export async function getAuditLogs(
  schoolId: string,
  options: {
    from?: string;
    to?: string;
    action?: string;
    userId?: string;
    resource?: string;
    limit?: number;
    cursor?: string;
  } = {}
) {
  const where: Record<string, unknown> = { schoolId };

  if (options.action) where.action = options.action;
  if (options.userId) where.userId = options.userId;
  if (options.resource) where.resource = options.resource;
  if (options.from || options.to) {
    where.createdAt = {
      ...(options.from ? { gte: new Date(options.from) } : {}),
      ...(options.to ? { lte: new Date(options.to) } : {}),
    };
  }

  const limit = Math.min(options.limit ?? 50, 100);

  const logs = await prisma.auditLog.findMany({
    where: where as any,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });

  const hasMore = logs.length > limit;
  const data = hasMore ? logs.slice(0, limit) : logs;

  return {
    data,
    pagination: {
      cursor: data.length > 0 ? data[data.length - 1].id : null,
      hasMore,
      limit,
    },
  };
}
