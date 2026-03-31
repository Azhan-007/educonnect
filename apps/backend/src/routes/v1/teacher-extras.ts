import type { FastifyInstance } from "fastify";
import { sendSuccess } from "../../utils/response";

/**
 * Teacher tasks & activities stub routes.
 * Returns empty arrays so the mobile dashboard doesn't error out.
 * Replace with real implementations when the feature is built.
 */
export default async function teacherExtrasRoutes(server: FastifyInstance) {
  /** Pending tasks for a teacher (assignments to grade, attendance to mark, etc.) */
  server.get("/teacher-tasks", async (request, reply) => {
    return sendSuccess(request, reply, []);
  });

  /** Recent activity log for a teacher */
  server.get("/teacher-activities", async (request, reply) => {
    return sendSuccess(request, reply, []);
  });
}
