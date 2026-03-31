import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { createOrder } from "../../services/payment.service";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess } from "../../utils/response";
import { Errors } from "../../errors";

const createOrderSchema = z.object({
  amount: z
    .number()
    .int()
    .positive("Amount must be a positive integer (in paise)"),
  currency: z.string().length(3).default("INR"),
  plan: z.string().min(1, "Plan is required"),
  durationDays: z.number().int().positive().optional(),
});

const preHandler = [
  authenticate,
  tenantGuard,
  roleMiddleware(["Admin", "SuperAdmin"]),
];

export default async function paymentRoutes(server: FastifyInstance) {
  // POST /api/v1/payments/create-order
  server.post(
    "/payments/create-order",
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = createOrderSchema.safeParse(request.body);

      if (!result.success) {
        throw Errors.validation(result.error.flatten().fieldErrors);
      }

      const order = await createOrder({
        amount: result.data.amount,
        currency: result.data.currency,
        schoolId: request.schoolId,
        plan: result.data.plan,
        durationDays: result.data.durationDays,
      });

      return sendSuccess(request, reply, { order }, 201);
    }
  );
}
