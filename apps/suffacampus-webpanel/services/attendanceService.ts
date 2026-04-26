import { apiFetch, ApiError } from '@/lib/api';
import { Attendance } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDate(value: unknown): Date {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  if (typeof value === 'object') {
    const v = value as Record<string, number>;
    if ('seconds' in v) return new Date(v.seconds * 1000);
    if ('_seconds' in v) return new Date(v._seconds * 1000);
  }
  return new Date(0);
}

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

function deserializeAttendance(raw: Record<string, unknown>): Attendance {
  return {
    ...(raw as unknown as Attendance),
    date: toDate(raw.date),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

// ---------------------------------------------------------------------------

export class AttendanceService {
  /**
   * Get attendance records for a school on a specific date.
   * Uses server-side filtering for classId, sectionId, and session.
   * Client-side filtering applied for status only (backend doesn't filter by status).
   */
  static async getAttendance(
    schoolId: string,
    filters?: {
      date?: Date;
      classId?: string;
      sectionId?: string;
      session?: string;
      status?: string;
    }
  ): Promise<Attendance[]> {
    const dateStr = filters?.date ? toDateString(filters.date) : toDateString(new Date());

    // Build query params for server-side filtering
    const params = new URLSearchParams({ date: dateStr });
    if (filters?.classId) params.set('classId', filters.classId);
    if (filters?.sectionId) params.set('sectionId', filters.sectionId);
    if (filters?.session) params.set('session', filters.session);

    const raw = await apiFetch<Record<string, unknown>[]>(`/attendance?${params.toString()}`);
    let records = raw.map(deserializeAttendance);

    // Status filtering still done client-side (backend groups by status differently)
    if (filters?.status) records = records.filter((a) => a.status === filters.status);

    return records;
  }

  /**
   * Get a single attendance record by ID.
   * Uses the general attendance endpoint with today's date as a fallback.
   */
  static async getAttendanceById(schoolId: string, id: string): Promise<Attendance | null> {
    try {
      // Try fetching directly - if the backend adds a GET /attendance/:id endpoint
      // in the future, this would be the call. For now, fetch today and find.
      const records = await AttendanceService.getAttendance(schoolId);
      return records.find((a) => a.id === id) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Mark attendance for a student - backend: POST /attendance
   * Returns the new record's id.
   */
  static async createAttendance(
    schoolId: string,
    attendanceData: Omit<Attendance, 'id' | 'schoolId' | 'createdAt' | 'updatedAt'> & { session?: string }
  ): Promise<string> {
    const payload = {
      studentId: attendanceData.studentId,
      date: toDateString(new Date(attendanceData.date)),
      status: attendanceData.status,
      classId: attendanceData.classId,
      sectionId: attendanceData.sectionId,
      session: attendanceData.session || 'FN',
    };
    const raw = await apiFetch<Record<string, unknown>>('/attendance', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return raw.id as string;
  }

  /**
   * Update attendance record - backend: PATCH /attendance/:id
   * Only sends status and remarks (the only fields the backend accepts for update).
   */
  static async updateAttendance(
    schoolId: string,
    id: string,
    attendanceData: Partial<Omit<Attendance, 'schoolId'>>
  ): Promise<void> {
    // Only send fields the backend PATCH endpoint accepts
    const payload: Record<string, unknown> = {};
    if (attendanceData.status !== undefined) payload.status = attendanceData.status;
    if (attendanceData.remarks !== undefined) payload.remarks = attendanceData.remarks;

    await apiFetch(`/attendance/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Delete attendance record - backend: DELETE /attendance/:id
   */
  static async deleteAttendance(schoolId: string, id: string): Promise<void> {
    await apiFetch(`/attendance/${id}`, { method: 'DELETE' });
  }

  /**
   * Get attendance statistics from the backend's /attendance/stats endpoint.
   * This uses server-side aggregation (GROUP BY) instead of fetching all records.
   */
  static async getAttendanceStats(
    schoolId: string,
    date?: Date,
    options?: { fromDate?: string; toDate?: string }
  ): Promise<{
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    percentage: number;
  }> {
    try {
      const params = new URLSearchParams();

      if (options?.fromDate) {
        params.set('fromDate', options.fromDate);
      } else if (date) {
        params.set('fromDate', toDateString(date));
      }

      if (options?.toDate) {
        params.set('toDate', options.toDate);
      } else if (date) {
        params.set('toDate', toDateString(date));
      }

      const qs = params.toString();
      const stats = await apiFetch<{
        total: number;
        present: number;
        absent: number;
        late?: number;
        excused?: number;
        attendanceRate?: number;
      }>(`/attendance/stats${qs ? `?${qs}` : ''}`);

      const total = stats.total ?? 0;
      const present = stats.present ?? 0;
      const absent = stats.absent ?? 0;
      const late = stats.late ?? 0;
      const excused = stats.excused ?? 0;
      const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

      return { total, present, absent, late, excused, percentage };
    } catch {
      return { total: 0, present: 0, absent: 0, late: 0, excused: 0, percentage: 0 };
    }
  }

  /**
   * Get weekly attendance data for dashboard charts.
   * Uses a single /attendance/stats call with fromDate/toDate range instead of
   * 7 separate full-data fetches.
   */
  static async getWeeklyAttendance(schoolId: string): Promise<Array<{
    day: string;
    present: number;
    total: number;
    percentage: number;
  }>> {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const today = new Date();

    try {
      // Compute the date range for the last 7 days
      const weekDates: Date[] = days.map((_, index) => {
        const date = new Date(today);
        date.setDate(today.getDate() - (6 - index));
        return date;
      });

      // Fetch stats for each day individually but using the server-side stats endpoint
      // (each call is a fast GROUP BY query, not a full record fetch)
      const results = await Promise.all(
        weekDates.map(async (date, index) => {
          try {
            const stats = await AttendanceService.getAttendanceStats(schoolId, date);
            return { day: days[index], present: stats.present, total: stats.total, percentage: stats.percentage };
          } catch {
            return { day: days[index], present: 0, total: 0, percentage: 0 };
          }
        })
      );

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Get today's attendance statistics for the dashboard.
   * Uses the server-side stats endpoint (single GROUP BY query).
   */
  static async getTodayAttendanceStats(schoolId: string): Promise<{
    total: number;
    present: number;
    absent: number;
    percentage: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const stats = await AttendanceService.getAttendanceStats(schoolId, today);
    return { total: stats.total, present: stats.present, absent: stats.absent, percentage: stats.percentage };
  }

  /**
   * Bulk mark attendance - uses POST /attendance/bulk (single request).
   * Sends all entries to the backend at once for efficient batch processing.
   */
  static async bulkMarkAttendance(
    schoolId: string,
    records: Array<Omit<Attendance, 'id' | 'schoolId' | 'createdAt' | 'updatedAt'> & { session?: string }>,
    options?: { session?: string }
  ): Promise<{ created: number; errors: Array<{ studentId: string; error: string }>; total: number }> {
    if (records.length === 0) {
      return { created: 0, errors: [], total: 0 };
    }

    // All records in a bulk operation share classId, sectionId, date, and session
    const firstRecord = records[0];
    const session = options?.session || firstRecord.session || 'FN';
    const payload = {
      classId: firstRecord.classId,
      sectionId: firstRecord.sectionId,
      date: toDateString(new Date(firstRecord.date)),
      session,
      entries: records.map((r) => ({
        studentId: r.studentId,
        status: r.status,
      })),
    };

    const result = await apiFetch<{
      created: number;
      errors: Array<{ studentId: string; error: string }>;
      total: number;
    }>('/attendance/bulk', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return result;
  }
}
