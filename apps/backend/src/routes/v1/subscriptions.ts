import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { enforceSubscription } from "../../middleware/subscription";
import { firestore } from "../../lib/firebase-admin";
import {
  cancelSubscription,
  type SubStatus,
} from "../../services/subscription.service";
import {
  getInvoicesBySchool,
  getInvoiceById,
} from "../../services/invoice.service";
import {
  previewPlanChange,
  executePlanChange,
  listPlans,
} from "../../services/plan-change.service";
import { sendSuccess } from "../../utils/response";
import { Errors } from "../../errors";
import { writeAuditLog } from "../../services/audit.service";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const cancelSubscriptionSchema = z.object({
  reason: z.string().max(500).optional(),
});

const changePlanSchema = z.object({
  newPlan: z.enum(["free", "basic", "pro", "enterprise"]),
  billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
});

const previewPlanSchema = z.object({
  newPlan: z.enum(["free", "basic", "pro", "enterprise"]),
  billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
});

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export default async function subscriptionRoutes(server: FastifyInstance) {
  const authChain = [
    authenticate,
    tenantGuard,
    roleMiddleware(["Admin", "SuperAdmin"]),
  ];

  // -----------------------------------------------------------------------
  // GET /subscriptions/status — current subscription state
  // -----------------------------------------------------------------------
  server.get(
    "/subscriptions/status",
    { preHandler: authChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;

      const schoolDoc = await firestore
        .collection("schools")
        .doc(schoolId)
        .get();

      if (!schoolDoc.exists) {
        return reply.status(404).send({
          success: false,
          error: { code: "SCHOOL_NOT_FOUND", message: "School not found" },
        });
      }

      const data = schoolDoc.data()!;

      const status: Record<string, unknown> = {
        schoolId,
        subscriptionPlan: data.subscriptionPlan ?? "Trial",
        subscriptionStatus: (data.subscriptionStatus as SubStatus) ?? "trial",
        autoRenew: data.autoRenew ?? false,
        trialEndDate: data.trialEndDate ?? null,
        currentPeriodStart: data.currentPeriodStart ?? null,
        currentPeriodEnd: data.currentPeriodEnd ?? null,
        cancelledAt: data.cancelledAt ?? null,
        cancelEffectiveDate: data.cancelEffectiveDate ?? null,
        paymentFailureCount: data.paymentFailureCount ?? 0,
        limits: data.limits ?? null,
      };

      return sendSuccess(request, reply, status);
    }
  );

  // -----------------------------------------------------------------------
  // POST /subscriptions/cancel — cancel at end of period
  // -----------------------------------------------------------------------
  server.post(
    "/subscriptions/cancel",
    { preHandler: authChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;
      const uid = request.user!.uid;

      const body = cancelSubscriptionSchema.parse(request.body ?? {});

      const result = await cancelSubscription(schoolId, uid);

      await writeAuditLog("SUBSCRIPTION_CANCEL_REQUESTED", uid, schoolId, {
        cancelEffectiveDate: result.cancelEffectiveDate,
        reason: body.reason ?? null,
      });

      // Invalidate school cache after status change
      server.cache.del("school", schoolId);

      return sendSuccess(request, reply, {
        cancelEffectiveDate: result.cancelEffectiveDate,
        message:
          "Subscription will be cancelled at the end of the current billing period",
        reason: body.reason,
      });
    }
  );

  // -----------------------------------------------------------------------
  // GET /subscriptions/invoices — list invoices for current school
  // -----------------------------------------------------------------------
  server.get(
    "/subscriptions/invoices",
    { preHandler: authChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;
      const { limit } = (request.query as Record<string, string>) ?? {};
      const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);

      const invoices = await getInvoicesBySchool(schoolId, parsedLimit);

      return sendSuccess(request, reply, { invoices, count: invoices.length });
    }
  );

  // -----------------------------------------------------------------------
  // GET /subscriptions/invoices/:invoiceId — single invoice detail
  // -----------------------------------------------------------------------
  server.get<{ Params: { invoiceId: string } }>(
    "/subscriptions/invoices/:invoiceId",
    { preHandler: authChain },
    async (request, reply) => {
      const schoolId = request.schoolId as string;
      const { invoiceId } = request.params;

      const invoice = await getInvoiceById(invoiceId, schoolId);

      if (!invoice) {
        return reply.status(404).send({
          success: false,
          error: { code: "INVOICE_NOT_FOUND", message: "Invoice not found" },
        });
      }

      return sendSuccess(request, reply, { invoice });
    }
  );

  // -----------------------------------------------------------------------
  // GET /subscriptions/usage — current usage vs limits
  // -----------------------------------------------------------------------
  server.get(
    "/subscriptions/usage",
    { preHandler: [...authChain, enforceSubscription] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;

      const schoolDoc = await firestore
        .collection("schools")
        .doc(schoolId)
        .get();

      if (!schoolDoc.exists) {
        return reply.status(404).send({
          success: false,
          error: { code: "SCHOOL_NOT_FOUND", message: "School not found" },
        });
      }

      const data = schoolDoc.data()!;
      const limits = (data.limits as Record<string, number>) ?? {};

      // Count actual usage in parallel
      const [studentCount, teacherCount, classCount] = await Promise.all([
        firestore
          .collection("students")
          .where("schoolId", "==", schoolId)
          .where("isDeleted", "==", false)
          .count()
          .get()
          .then((s) => s.data().count),
        firestore
          .collection("teachers")
          .where("schoolId", "==", schoolId)
          .where("isDeleted", "==", false)
          .count()
          .get()
          .then((s) => s.data().count),
        firestore
          .collection("classes")
          .where("schoolId", "==", schoolId)
          .where("isDeleted", "==", false)
          .count()
          .get()
          .then((s) => s.data().count),
      ]);

      const usage = {
        students: {
          current: studentCount,
          limit: limits.maxStudents ?? null,
          remaining:
            limits.maxStudents != null
              ? Math.max(0, limits.maxStudents - studentCount)
              : null,
        },
        teachers: {
          current: teacherCount,
          limit: limits.maxTeachers ?? null,
          remaining:
            limits.maxTeachers != null
              ? Math.max(0, limits.maxTeachers - teacherCount)
              : null,
        },
        classes: {
          current: classCount,
          limit: limits.maxClasses ?? null,
          remaining:
            limits.maxClasses != null
              ? Math.max(0, limits.maxClasses - classCount)
              : null,
        },
        plan: data.subscriptionPlan ?? "Trial",
        status: data.subscriptionStatus ?? "trial",
      };

      return sendSuccess(request, reply, usage);
    }
  );

  // -----------------------------------------------------------------------
  // GET /subscriptions/plans — list all available plans
  // -----------------------------------------------------------------------
  server.get(
    "/subscriptions/plans",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const plans = listPlans();
      return reply.status(200).send({ success: true, data: plans });
    }
  );

  // -----------------------------------------------------------------------
  // POST /subscriptions/change-plan/preview — dry-run proration preview
  // -----------------------------------------------------------------------
  server.post(
    "/subscriptions/change-plan/preview",
    { preHandler: authChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;

      const parsed = previewPlanSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const preview = await previewPlanChange(
        schoolId,
        parsed.data.newPlan,
        parsed.data.billingCycle
      );

      return sendSuccess(request, reply, preview);
    }
  );

  // -----------------------------------------------------------------------
  // POST /subscriptions/change-plan — execute plan upgrade or downgrade
  // -----------------------------------------------------------------------
  server.post(
    "/subscriptions/change-plan",
    { preHandler: authChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;
      const uid = request.user!.uid;

      const parsed = changePlanSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      try {
        const result = await executePlanChange(
          schoolId,
          parsed.data.newPlan,
          parsed.data.billingCycle,
          uid
        );

        await writeAuditLog("SUBSCRIPTION_PLAN_CHANGE", uid, schoolId, {
          newPlan: parsed.data.newPlan,
          billingCycle: parsed.data.billingCycle,
          hasImmediateOrder: Boolean(result.order),
        });

        // Invalidate school cache after plan change
        server.cache.del("school", schoolId);

        return sendSuccess(request, reply, result, result.order ? 201 : 200);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw Errors.badRequest(message);
      }
    }
  );
}
