import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createFeeSchema, updateFeeSchema } from "../../schemas/modules.schema";
import { paginationSchema } from "../../utils/pagination";
import {
  createFee,
  getFeesBySchool,
  getFeeById,
  updateFee,
  softDeleteFee,
  getFeeStats,
} from "../../services/fee.service";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { Errors } from "../../errors";
import { writeAuditLog } from "../../services/audit.service";

const preHandler = [authenticate, tenantGuard];

export default async function feeRoutes(server: FastifyInstance) {
  // POST /fees
  server.post(
    "/fees",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = createFeeSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);

      const fee = await createFee(request.schoolId, result.data, request.user.uid);

      await writeAuditLog("FEE_CREATED", request.user.uid, request.schoolId, {
        feeId: fee.id,
        studentId: fee.studentId,
        amount: fee.amount,
        dueDate: fee.dueDate,
        status: fee.status,
      });

      return sendSuccess(request, reply, fee, 201);
    }
  );

  // GET /fees (paginated, filterable)
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/fees",
    { preHandler },
    async (request, reply) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = {
        studentId: request.query.studentId,
        classId: request.query.classId,
        status: request.query.status,
        feeType: request.query.feeType,
      };

      const result = await getFeesBySchool(request.schoolId, pagination, filters);
      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );

  // GET /fees/stats — fee collection statistics
  server.get(
    "/fees/stats",
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const stats = await getFeeStats(request.schoolId);
      return sendSuccess(request, reply, stats);
    }
  );

  // GET /fees/:id
  server.get<{ Params: { id: string } }>(
    "/fees/:id",
    { preHandler },
    async (request, reply) => {
      const fee = await getFeeById(request.params.id, request.schoolId);
      if (!fee) throw Errors.notFound("Fee", request.params.id);
      return sendSuccess(request, reply, fee);
    }
  );

  // PATCH /fees/:id
  server.patch<{ Params: { id: string } }>(
    "/fees/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const result = updateFeeSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);
      if (Object.keys(result.data).length === 0) throw Errors.badRequest("No fields to update");

      const fee = await updateFee(request.params.id, request.schoolId, result.data, request.user.uid);

      await writeAuditLog("FEE_UPDATED", request.user.uid, request.schoolId, {
        feeId: request.params.id,
        updatedFields: Object.keys(result.data),
      });

      return sendSuccess(request, reply, fee);
    }
  );

  // DELETE /fees/:id
  server.delete<{ Params: { id: string } }>(
    "/fees/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const deleted = await softDeleteFee(request.params.id, request.schoolId, request.user.uid);
      if (!deleted) throw Errors.notFound("Fee", request.params.id);

      await writeAuditLog("FEE_DELETED", request.user.uid, request.schoolId, {
        feeId: request.params.id,
      });

      return sendSuccess(request, reply, { message: "Fee deleted" });
    }
  );
}
