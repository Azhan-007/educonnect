import type { FastifyInstance } from "fastify";
import {
  verifyWebhookSignature,
  handlePaymentCaptured,
  type PaymentCapturedPayload,
} from "../services/payment.service";
import { verifyStripeWebhookSignature } from "../services/payment.service";
import { reactivateSubscription } from "../services/subscription.service";
import { createPaidInvoice } from "../services/invoice.service";
import { writeAuditLog } from "../services/audit.service";
import { logWebhookFailure } from "../services/webhook-failure.service";
import { enqueueWebhookRetry } from "../services/webhook-retry-queue.service";
import { firestore, admin } from "../lib/firebase-admin";

// ---------------------------------------------------------------------------
// Generic Razorpay webhook payload type (covers multiple event types)
// ---------------------------------------------------------------------------

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: {
      entity: {
        id: string;
        order_id: string;
        amount: number;
        currency: string;
        status: string;
        notes: Record<string, string>;
        error_code?: string;
        error_description?: string;
        error_reason?: string;
      };
    };
    refund?: {
      entity: {
        id: string;
        payment_id: string;
        amount: number;
        currency: string;
        notes: Record<string, string>;
      };
    };
  };
}

export default async function webhookRoutes(server: FastifyInstance) {
  // Override body parser for this scoped plugin only — we need the raw Buffer
  // to verify Razorpay's HMAC-SHA256 signature.
  server.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => {
      done(null, body);
    }
  );

  // POST /webhooks/razorpay — receive Razorpay events
  server.post("/webhooks/razorpay", async (request, reply) => {
    const rawBody = request.body as Buffer;
    const signature = request.headers["x-razorpay-signature"];

    // 1. Verify presence of signature header
    if (!signature || typeof signature !== "string") {
      request.log.warn("Razorpay webhook: missing x-razorpay-signature header");
      return reply
        .status(400)
        .send({ success: false, message: "Missing signature header" });
    }

    // 2. Verify HMAC-SHA256 signature
    let isValid: boolean;
    try {
      isValid = verifyWebhookSignature(rawBody, signature);
    } catch (err) {
      request.log.error({ err }, "Razorpay webhook: signature verification error");
      return reply
        .status(500)
        .send({ success: false, message: "Internal server error" });
    }

    if (!isValid) {
      request.log.warn("Razorpay webhook: invalid signature — possible forgery");
      return reply
        .status(400)
        .send({ success: false, message: "Invalid signature" });
    }

    // 3. Parse the verified body
    let event: RazorpayWebhookPayload;
    try {
      event = JSON.parse(rawBody.toString("utf-8")) as RazorpayWebhookPayload;
    } catch {
      return reply
        .status(400)
        .send({ success: false, message: "Malformed JSON body" });
    }

    request.log.info({ event: event.event }, "Razorpay webhook received");

    // 4. Handle supported events
    try {
      switch (event.event) {
        // ---- Payment captured (subscription activation / renewal) ----
        case "payment.captured": {
          const processed = await handlePaymentCaptured(
            event as PaymentCapturedPayload
          );

          if (processed) {
            const pe = event.payload.payment!.entity;
            const { schoolId, plan, durationDays } = pe.notes;

            // Create a formal invoice via the invoice service
            const periodDays = parseInt(durationDays) || 30;
            const now = new Date();
            const periodEnd = new Date(
              now.getTime() + periodDays * 24 * 60 * 60 * 1000
            );

            await createPaidInvoice({
              schoolId,
              plan,
              amount: pe.amount,
              currency: pe.currency,
              razorpayPaymentId: pe.id,
              razorpayOrderId: pe.order_id,
              billingPeriodStart: now.toISOString().split("T")[0],
              billingPeriodEnd: periodEnd.toISOString().split("T")[0],
            });

            // If the school was expired/cancelled, reactivate
            const schoolDoc = await firestore
              .collection("schools")
              .doc(schoolId)
              .get();
            const status = schoolDoc.data()?.subscriptionStatus;
            if (status === "past_due") {
              await reactivateSubscription(schoolId, plan, periodDays);
            }

            request.log.info(
              { event: event.event, paymentId: pe.id, orderId: pe.order_id },
              "Razorpay webhook: payment.captured processed"
            );
          } else {
            request.log.info(
              { paymentId: event.payload.payment?.entity.id },
              "Razorpay webhook: payment.captured skipped — duplicate event"
            );
          }
          break;
        }

        // ---- Payment failed ----
        case "payment.failed": {
          const pe = event.payload.payment?.entity;
          const schoolId = pe?.notes?.schoolId;

          if (schoolId) {
            // Increment failure count
            const schoolRef = firestore.collection("schools").doc(schoolId);
            await schoolRef.update({
              paymentFailureCount: admin.firestore.FieldValue.increment(1),
              lastPaymentError: pe?.error_description ?? "Payment failed",
              updatedAt: admin.firestore.Timestamp.now(),
            });

            await writeAuditLog("PAYMENT_FAILED", "system", schoolId, {
              razorpayPaymentId: pe?.id,
              errorCode: pe?.error_code,
              errorDescription: pe?.error_description,
              errorReason: pe?.error_reason,
            });
          }

          request.log.warn(
            { paymentId: pe?.id, schoolId, error: pe?.error_description },
            "Razorpay webhook: payment.failed"
          );
          break;
        }

        // ---- Refund processed ----
        case "refund.created": {
          const re = event.payload.refund?.entity;
          const schoolId = re?.notes?.schoolId;

          if (schoolId && re) {
            await writeAuditLog("REFUND_CREATED", "system", schoolId, {
              refundId: re.id,
              paymentId: re.payment_id,
              amount: re.amount,
              currency: re.currency,
            });

            // Update invoice status to refunded
            const invoiceSnap = await firestore
              .collection("invoices")
              .where("razorpayPaymentId", "==", re.payment_id)
              .limit(1)
              .get();

            if (!invoiceSnap.empty) {
              await invoiceSnap.docs[0].ref.update({
                status: "refunded",
                refundId: re.id,
                refundAmount: re.amount,
                updatedAt: admin.firestore.Timestamp.now(),
              });
            }
          }

          request.log.info(
            { refundId: re?.id, paymentId: re?.payment_id },
            "Razorpay webhook: refund.created processed"
          );
          break;
        }

        default:
          request.log.info(
            { event: event.event },
            "Razorpay webhook: unhandled event type — ignored"
          );
      }
    } catch (err) {
      request.log.error({ err, event: event.event }, "Razorpay webhook: handler failed");

      // Log the failure for later review / retry
      const failureId = await logWebhookFailure({
        eventType: event.event,
        razorpayEventId: event.payload?.payment?.entity?.id ?? null,
        schoolId: event.payload?.payment?.entity?.notes?.schoolId ?? null,
        rawPayload: rawBody.toString("utf-8"),
        error: err,
      });

      request.log.warn(
        { failureId, event: event.event },
        "Razorpay webhook: failure logged — use POST /webhooks/retry/:failureId to re-process"
      );

      if (failureId) {
        const queued = await enqueueWebhookRetry(failureId, {
          delayMs: 60_000,
          requestedBy: "system:webhook",
          allowInlineFallback: false,
        });

        if (queued.queued) {
          request.log.info(
            { failureId, jobId: queued.jobId },
            "Razorpay webhook: automatic retry queued"
          );
        } else {
          const queueError = queued.result.success ? "Retry executed immediately" : queued.result.error;
          request.log.warn(
            { failureId, error: queueError },
            "Razorpay webhook: automatic retry not queued"
          );
        }
      }

      // Return 200 so Razorpay does not keep re-delivering the same event.
      // We own the retry cycle from here via webhookFailures.
      return reply.status(200).send({ success: false, message: "Handler error — logged", failureId });
    }

    // Always return 200 to acknowledge receipt
    return reply.status(200).send({ success: true });

    // POST /webhooks/stripe — receive Stripe events
    server.post("/webhooks/stripe", async (request, reply) => {
      // Get raw buffer from request stream
      let rawBody: Buffer;
      try {
        // For Stripe webhook, we need the raw body for signature verification
        // The body should already be parsed as Buffer by our content-type handler
        if (request.body instanceof Buffer) {
          rawBody = request.body;
        } else if (typeof request.body === 'string') {
          rawBody = Buffer.from(request.body);
        } else {
          rawBody = Buffer.from(JSON.stringify(request.body));
        }
      } catch (err) {
        request.log.error({ err }, "Failed to get raw body for Stripe webhook");
        return reply.status(400).send({ success: false, message: "Failed to process request body" });
      }

      const signature = request.headers["stripe-signature"];

      // 1. Verify presence of signature header
      if (!signature || typeof signature !== "string") {
        request.log.warn("Stripe webhook: missing stripe-signature header");
        return reply
          .status(400)
          .send({ success: false, message: "Missing signature header" });
      }

      // 2. Verify HMAC-SHA256 signature with timestamp validation
      let isValid: boolean;
      try {
        isValid = verifyStripeWebhookSignature(rawBody, signature);
      } catch (err) {
        request.log.error({ err }, "Stripe webhook: signature verification error");
        return reply
          .status(400)
          .send({ success: false, message: (err instanceof Error ? err.message : "Signature verification failed") });
      }

      if (!isValid) {
        request.log.warn("Stripe webhook: invalid signature — possible forgery");
        return reply
          .status(400)
          .send({ success: false, message: "Invalid signature" });
      }

      // 3. Parse the verified body
      let event: Record<string, unknown>;
      try {
        const bodyStr = rawBody.toString('utf-8');
        event = JSON.parse(bodyStr) as Record<string, unknown>;
      } catch {
        return reply
          .status(400)
          .send({ success: false, message: "Malformed JSON body" });
      }

      request.log.info({ type: event.type }, "Stripe webhook received");

      // 4. Handle supported Stripe events
      try {
        const eventType = event.type as string;
      
        switch (eventType) {
          case "charge.succeeded": {
            const charge = (event.data as Record<string, unknown>).object as Record<string, unknown>;
            const metadata = charge.metadata as Record<string, string>;

            if (metadata?.schoolId) {
              // Note: Full Stripe integration requires schema updates to support stripeChargeId
              // For now, we log the event and audit it
              await writeAuditLog("STRIPE_CHARGE_SUCCEEDED", "system", metadata.schoolId, {
                chargeId: charge.id,
                amount: (charge.amount as number) / 100,
                currency: charge.currency,
                plan: metadata.plan,
              });
            
              await reactivateSubscription(metadata.schoolId, metadata.plan ?? "basic", 30);

              request.log.info(
                { chargeId: charge.id, schoolId: metadata.schoolId },
                "Stripe webhook: charge.succeeded processed"
              );
            }
            break;
          }

          case "charge.failed": {
            const charge = (event.data as Record<string, unknown>).object as Record<string, unknown>;
            const metadata = charge.metadata as Record<string, string>;

            if (metadata?.schoolId) {
              const schoolRef = firestore.collection("schools").doc(metadata.schoolId);
              await schoolRef.update({
                paymentFailureCount: admin.firestore.FieldValue.increment(1),
                lastPaymentError: (charge.failure_message as string) ?? "Charge failed",
                updatedAt: admin.firestore.Timestamp.now(),
              });

              await writeAuditLog("PAYMENT_FAILED", "system", metadata.schoolId, {
                stripeChargeId: charge.id,
                failureCode: charge.failure_code,
                failureMessage: charge.failure_message,
              });
            }

            request.log.warn(
              { chargeId: charge.id, schoolId: metadata?.schoolId },
              "Stripe webhook: charge.failed"
            );
            break;
          }

          case "charge.refunded": {
            const charge = (event.data as Record<string, unknown>).object as Record<string, unknown>;
            const metadata = charge.metadata as Record<string, string>;

            if (metadata?.schoolId) {
              await writeAuditLog("REFUND_CREATED", "system", metadata.schoolId, {
                chargeId: charge.id,
                amount: (charge.amount_refunded as number) / 100,
                currency: (charge.currency as string).toUpperCase(),
              });
            }

            request.log.info(
              { chargeId: charge.id },
              "Stripe webhook: charge.refunded processed"
            );
            break;
          }

          default:
            request.log.debug(
              { type: eventType },
              "Stripe webhook: unhandled event type — ignored"
            );
        }
      } catch (err) {
        request.log.error({ err, type: event.type }, "Stripe webhook: handler failed");
      
        // Log the failure for later review
        const failureId = await logWebhookFailure({
          eventType: (event.type as string) ?? "unknown",
          rawPayload: rawBody.toString('utf-8'),
          error: err,
        });

        request.log.warn(
          { failureId, type: event.type },
          "Stripe webhook: failure logged — use POST /webhooks/retry/:failureId to re-process"
        );

        if (failureId) {
          const queued = await enqueueWebhookRetry(failureId, {
            delayMs: 60_000,
            requestedBy: "system:webhook",
            allowInlineFallback: false,
          });

          if (queued.queued) {
            request.log.info(
              { failureId, jobId: queued.jobId },
              "Stripe webhook: automatic retry queued"
            );
          } else {
            const queueError = queued.result.success ? "Retry executed immediately" : queued.result.error;
            request.log.warn(
              { failureId, error: queueError },
              "Stripe webhook: automatic retry not queued"
            );
          }
        }

        // Return 200 so Stripe doesn't keep re-delivering
        return reply.status(200).send({ success: false, message: "Handler error — logged", failureId });
      }

      // Always return 200 to acknowledge receipt
      return reply.status(200).send({ success: true });
    });
  });
}
