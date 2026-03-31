import { prisma } from "../lib/prisma";
import type { CreateFeeInput, UpdateFeeInput } from "../schemas/modules.schema";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";

export async function createFee(
  schoolId: string,
  data: CreateFeeInput,
  performedBy: string
) {
  const fee = await prisma.fee.create({
    data: {
      schoolId,
      studentId: data.studentId,
      studentName: data.studentName,
      classId: data.classId,
      sectionId: data.sectionId,
      amount: data.amount,
      dueDate: data.dueDate,
      paidDate: data.paidDate,
      status: (data.status as any) ?? "Pending",
      paymentMode: data.paymentMode,
      transactionId: data.transactionId,
      feeType: data.feeType,
      amountPaid: data.amountPaid ?? 0,
      remarks: data.remarks,
    },
  });

  await writeAuditLog("CREATE_FEE", performedBy, schoolId, {
    feeId: fee.id,
    studentId: fee.studentId,
    amount: fee.amount,
    feeType: fee.feeType,
  });

  return fee;
}

export async function getFeesBySchool(
  schoolId: string,
  pagination: { limit?: number; cursor?: string; sortBy?: string; sortOrder?: "asc" | "desc" },
  filters: { studentId?: string; classId?: string; status?: string; feeType?: string } = {}
) {
  const where: any = { schoolId };
  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.classId) where.classId = filters.classId;
  if (filters.status) where.status = filters.status;
  if (filters.feeType) where.feeType = filters.feeType;

  const limit = Math.min(pagination.limit ?? 20, 100);

  const fees = await prisma.fee.findMany({
    where,
    orderBy: { [pagination.sortBy ?? "createdAt"]: pagination.sortOrder ?? "desc" },
    take: limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const hasMore = fees.length > limit;
  const data = hasMore ? fees.slice(0, limit) : fees;

  return {
    data,
    pagination: { cursor: data.length > 0 ? data[data.length - 1].id : null, hasMore, limit },
  };
}

export async function getFeeById(feeId: string, schoolId: string) {
  const fee = await prisma.fee.findUnique({ where: { id: feeId } });
  if (!fee || fee.schoolId !== schoolId) return null;
  return fee;
}

export async function updateFee(
  feeId: string,
  schoolId: string,
  data: UpdateFeeInput,
  performedBy: string
) {
  const existing = await prisma.fee.findUnique({ where: { id: feeId } });
  if (!existing) throw Errors.notFound("Fee", feeId);
  if (existing.schoolId !== schoolId) throw Errors.tenantMismatch();

  const updated = await prisma.fee.update({
    where: { id: feeId },
    data: { ...data, status: data.status as any },
  });

  await writeAuditLog("UPDATE_FEE", performedBy, schoolId, {
    feeId,
    updatedFields: Object.keys(data),
  });

  return updated;
}

export async function softDeleteFee(
  feeId: string,
  schoolId: string,
  performedBy: string
): Promise<boolean> {
  const existing = await prisma.fee.findUnique({ where: { id: feeId } });
  if (!existing || existing.schoolId !== schoolId) return false;

  await prisma.fee.delete({ where: { id: feeId } });

  await writeAuditLog("DELETE_FEE", performedBy, schoolId, { feeId, studentId: existing.studentId });
  return true;
}

/** Fee statistics for dashboard / reports — uses Prisma aggregations */
export async function getFeeStats(schoolId: string) {
  const [totals, statusCounts] = await Promise.all([
    prisma.fee.aggregate({
      where: { schoolId },
      _sum: { amount: true, amountPaid: true },
      _count: true,
    }),
    prisma.fee.groupBy({
      by: ["status"],
      where: { schoolId },
      _count: true,
      _sum: { amount: true, amountPaid: true },
    }),
  ]);

  const statusMap = Object.fromEntries(
    statusCounts.map((s) => [s.status, { count: s._count, sum: s._sum.amount ?? 0, paid: s._sum.amountPaid ?? 0 }])
  );

  return {
    totalFees: totals._sum.amount ?? 0,
    collectedAmount: (statusMap.Paid?.sum ?? 0) + (statusMap.Partial?.paid ?? 0),
    pendingAmount: (statusMap.Pending?.sum ?? 0) + (statusMap.Overdue?.sum ?? 0),
    totalRecords: totals._count,
    paidCount: statusMap.Paid?.count ?? 0,
    pendingCount: statusMap.Pending?.count ?? 0,
    overdueCount: statusMap.Overdue?.count ?? 0,
    partialCount: statusMap.Partial?.count ?? 0,
  };
}
