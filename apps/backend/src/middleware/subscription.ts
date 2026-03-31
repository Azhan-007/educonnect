import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma";
import { Errors } from "../errors";
import type { CacheService } from "../plugins/cache";

interface SchoolSubscription {
  subscriptionPlan: string;
  maxStudents: number;
  maxTeachers: number;
}

/**
 * Fastify `preHandler` hook that enforces subscription plan limits.
 * Now queries PostgreSQL via Prisma instead of Firestore.
 */
export async function enforceSubscription(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { schoolId } = request;

  // 1. Fetch school (with cache)
  const cache: CacheService | undefined = request.server.cache;
  let school: SchoolSubscription;
  try {
    const cached = cache?.get<SchoolSubscription>("school", schoolId);
    if (cached) {
      school = cached;
      request.log.debug({ schoolId }, "School subscription loaded from cache");
    } else {
      const schoolRow = await prisma.school.findUnique({
        where: { id: schoolId },
        select: { subscriptionPlan: true, maxStudents: true, maxTeachers: true },
      });

      if (!schoolRow) {
        request.log.warn({ schoolId }, "School not found during subscription check");
        return reply.status(403).send({ success: false, message: "School not found" });
      }

      school = {
        subscriptionPlan: schoolRow.subscriptionPlan,
        maxStudents: schoolRow.maxStudents,
        maxTeachers: schoolRow.maxTeachers,
      };
      cache?.set("school", schoolId, school);
    }
  } catch (err) {
    request.log.error({ err, schoolId }, "Failed to fetch school");
    return reply.status(500).send({ success: false, message: "Internal server error" });
  }

  const studentLimit = school.maxStudents ?? 0;

  // 2. Skip for unlimited plans
  if (studentLimit === -1) {
    request.log.info({ schoolId, plan: school.subscriptionPlan }, "Subscription check skipped — unlimited plan");
    return;
  }

  // 3. Count current students via Prisma
  let studentCount: number;
  try {
    studentCount = await prisma.student.count({
      where: { schoolId, isDeleted: false },
    });
  } catch (err) {
    request.log.error({ err, schoolId }, "Failed to count students");
    return reply.status(500).send({ success: false, message: "Internal server error" });
  }

  // 4. Enforce the limit
  if (studentCount >= studentLimit) {
    request.log.warn({ schoolId, plan: school.subscriptionPlan, studentCount, studentLimit }, "Subscription limit reached");
    throw Errors.subscriptionLimitReached("students", studentLimit);
  }

  request.log.info({ schoolId, plan: school.subscriptionPlan, studentCount, studentLimit }, "Subscription check passed");
}
