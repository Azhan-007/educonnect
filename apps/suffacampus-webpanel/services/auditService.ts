import { apiFetchPaginated } from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type AuditAction =
  | 'CREATE_STUDENT' | 'UPDATE_STUDENT' | 'DELETE_STUDENT'
  | 'CREATE_TEACHER' | 'UPDATE_TEACHER' | 'DELETE_TEACHER'
  | 'CREATE_CLASS' | 'UPDATE_CLASS' | 'DELETE_CLASS' | 'ADD_SECTION' | 'REMOVE_SECTION'
  | 'CREATE_EVENT' | 'UPDATE_EVENT' | 'DELETE_EVENT'
  | 'CREATE_FEE' | 'UPDATE_FEE' | 'DELETE_FEE'
  | 'CREATE_BOOK' | 'UPDATE_BOOK' | 'DELETE_BOOK' | 'ISSUE_BOOK' | 'RETURN_BOOK'
  | 'CREATE_RESULT' | 'UPDATE_RESULT' | 'DELETE_RESULT'
  | 'CREATE_TIMETABLE' | 'UPDATE_TIMETABLE' | 'DELETE_TIMETABLE'
  | 'UPDATE_SETTINGS'
  | 'MARK_ATTENDANCE' | 'BULK_ATTENDANCE' | 'PAYMENT_RECEIVED' | 'SUBSCRIPTION_UPGRADED' | 'WEBHOOK_RETRY'
  | 'CREATE_SCHOOL' | 'UPDATE_SCHOOL' | 'DELETE_SCHOOL' | 'CHANGE_PLAN'
  | 'CREATE_USER' | 'UPDATE_USER' | 'DELETE_USER'
  | 'SUBSCRIPTION_STATUS_CHANGE' | 'INVOICE_CREATED' | 'PAYMENT_FAILED' | 'REFUND_CREATED'
  | 'CREATE_PARENT_INVITE' | 'REDEEM_PARENT_INVITE';

export interface AuditLog {
  id: string;
  action: string;
  performedBy: string;
  schoolId: string;
  timestamp: { _seconds: number; _nanoseconds: number } | string;
  metadata: Record<string, unknown>;
}

interface RawAuditLog {
  id?: string;
  action?: string;
  performedBy?: string;
  userId?: string;
  schoolId?: string;
  timestamp?: { _seconds: number; _nanoseconds: number } | string;
  createdAt?: string;
  metadata?: unknown;
}

export interface AuditLogResponse {
  data: AuditLog[];
  total: number;
}

function normalizeAuditLog(raw: RawAuditLog): AuditLog {
  const metadata = raw.metadata && typeof raw.metadata === 'object'
    ? (raw.metadata as Record<string, unknown>)
    : {};

  return {
    id: raw.id ?? `audit-${Math.random().toString(36).slice(2, 10)}`,
    action: raw.action ?? 'SYSTEM_EVENT',
    performedBy: raw.performedBy ?? raw.userId ?? 'system',
    schoolId: raw.schoolId ?? '',
    timestamp: raw.timestamp ?? raw.createdAt ?? new Date(0).toISOString(),
    metadata,
  };
}

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

export class AuditService {
  /**
   * Fetch paginated audit logs for the current school.
   */
  static async getLogs(options?: {
    limit?: number;
    offset?: number;
    action?: AuditAction;
    performedBy?: string;
  }): Promise<AuditLogResponse> {
    const raw = await apiFetchPaginated<RawAuditLog>('/audit-logs', {
      limit: options?.limit,
      offset: options?.offset,
      action: options?.action,
      performedBy: options?.performedBy,
    });

    const data = (raw.data ?? []).map(normalizeAuditLog);

    return {
      data,
      total: raw.pagination?.total ?? data.length,
    };
  }
}
