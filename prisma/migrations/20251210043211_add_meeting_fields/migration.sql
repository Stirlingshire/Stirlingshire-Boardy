-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- AlterTable
ALTER TABLE "introduction" ADD COLUMN     "meeting_calendar_id" TEXT,
ADD COLUMN     "meeting_end_time" TIMESTAMPTZ,
ADD COLUMN     "meeting_start_time" TIMESTAMPTZ,
ADD COLUMN     "meeting_status" "MeetingStatus",
ADD COLUMN     "meeting_zoom_id" TEXT,
ADD COLUMN     "meeting_zoom_link" TEXT;
