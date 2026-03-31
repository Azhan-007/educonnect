/**
 * feesService.ts
 *
 * Backend routes:
 *   GET  /fees?studentId=       — fetch student fee summary + history
 *   POST /payments/create-order — initiate a payment order (Razorpay / gateway)
 *   POST /payments              — record a completed payment
 */

import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PaymentHistoryItem {
  date: string;
  amount: number;
  receiptId: string;
  status: "Paid" | "Pending" | "Failed";
  method?: string;
}

export interface FeeStructureItem {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  status: "Paid" | "Pending" | "Overdue";
}

export interface FeesData {
  total: number;
  paid: number;
  pending: number;
  dueDate: string;
  history: PaymentHistoryItem[];
  feeStructure: FeeStructureItem[];
}

export interface PaymentOrderPayload {
  studentId: string;
  feeId: string;
  amount: number;
  method: string;
}

export interface PaymentOrderResult {
  orderId: string;
  receiptId: string;
  amount: number;
  currency: string;
}

export interface RecordPaymentPayload {
  studentId: string;
  feeId: string;
  amount: number;
  method: string;
  receiptId: string;
  status: "Paid";
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Fetch fee summary and history for a student.
 * Replaces: getDocs(query(collection(db, "fees"), where("studentId", "==", id)))
 */
export async function getStudentFees(studentId: string): Promise<FeesData> {
  try {
    return await apiFetch<FeesData>("/fees", { params: { studentId } });
  } catch {
    return { total: 0, paid: 0, pending: 0, dueDate: "", history: [], feeStructure: [] };
  }
}

/**
 * Create a payment order with the payment gateway.
 * Maps to: POST /payments/create-order
 * Queues for offline retry if the network request fails.
 */
export async function createPaymentOrder(
  payload: PaymentOrderPayload
): Promise<PaymentOrderResult> {
  try {
    return await apiFetch<PaymentOrderResult>("/payments/create-order", {
      method: "POST",
      body: payload,
    });
  } catch (error: any) {
    // Queue for offline retry
    const { enqueueOfflineMutation } = await import("./offlineSyncQueue");
    await enqueueOfflineMutation({
      path: "/payments/create-order",
      method: "POST",
      body: payload,
    });
    console.warn("[PaymentOrder] Queued payment order for offline retry:", error.message);
    throw error; // Re-throw so caller knows it failed
  }
}

/**
 * Record a completed payment in the backend.
 * Maps to: POST /payments
 * Queues for offline retry if the network request fails.
 */
export async function recordPayment(
  payload: RecordPaymentPayload
): Promise<void> {
  try {
    await apiFetch<void>("/payments", {
      method: "POST",
      body: payload,
    });
  } catch (error: any) {
    // Queue for offline retry
    const { enqueueOfflineMutation } = await import("./offlineSyncQueue");
    await enqueueOfflineMutation({
      path: "/payments",
      method: "POST",
      body: payload,
    });
    console.warn("[PaymentRecord] Queued payment record for offline retry:", error.message);
    throw error; // Re-throw so caller knows it failed
  }
}
