-- AlterTable
ALTER TABLE "Notification"
ADD COLUMN IF NOT EXISTS "referenceId" TEXT,
ADD COLUMN IF NOT EXISTS "referenceType" TEXT,
ADD COLUMN IF NOT EXISTS "targetId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_referenceId_referenceType_targetId_idx"
ON "Notification"("referenceId", "referenceType", "targetId");
