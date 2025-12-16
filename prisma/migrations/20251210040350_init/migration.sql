-- CreateEnum
CREATE TYPE "IntroductionStatus" AS ENUM ('OPEN', 'PLACED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlacementStatus" AS ENUM ('PENDING_NOTIFY', 'NOTIFIED', 'INVOICED', 'PAID', 'DISPUTED');

-- CreateTable
CREATE TABLE "vendor" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "placement_terms" JSONB,
    "webhook_url" TEXT,
    "api_key_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "introduction" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "candidate_crd" BIGINT NOT NULL,
    "candidate_first_name" TEXT NOT NULL,
    "candidate_last_name" TEXT NOT NULL,
    "candidate_phone" TEXT,
    "candidate_email" TEXT,
    "candidate_linkedin" TEXT,
    "intro_timestamp" TIMESTAMPTZ NOT NULL,
    "recruiter_name" TEXT,
    "conversation_id" TEXT NOT NULL,
    "status" "IntroductionStatus" NOT NULL DEFAULT 'OPEN',
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "introduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hire" (
    "id" UUID NOT NULL,
    "crd_number" BIGINT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "firm_entity" TEXT NOT NULL,
    "firm_crd" BIGINT,
    "hire_date" DATE NOT NULL,
    "termination_date" DATE,
    "source" TEXT NOT NULL,
    "raw_source_reference" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "hire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "introduction_id" UUID NOT NULL,
    "hire_id" UUID NOT NULL,
    "candidate_crd" BIGINT NOT NULL,
    "hire_date" DATE NOT NULL,
    "status" "PlacementStatus" NOT NULL DEFAULT 'PENDING_NOTIFY',
    "fee_amount" DECIMAL(18,2) NOT NULL,
    "fee_currency" TEXT NOT NULL DEFAULT 'USD',
    "terms_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "introduction_candidate_crd_idx" ON "introduction"("candidate_crd");

-- CreateIndex
CREATE INDEX "introduction_status_idx" ON "introduction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "introduction_vendor_id_candidate_crd_conversation_id_key" ON "introduction"("vendor_id", "candidate_crd", "conversation_id");

-- CreateIndex
CREATE INDEX "hire_crd_number_idx" ON "hire"("crd_number");

-- CreateIndex
CREATE INDEX "hire_hire_date_idx" ON "hire"("hire_date");

-- CreateIndex
CREATE UNIQUE INDEX "placement_introduction_id_key" ON "placement"("introduction_id");

-- CreateIndex
CREATE INDEX "placement_candidate_crd_idx" ON "placement"("candidate_crd");

-- CreateIndex
CREATE INDEX "placement_status_idx" ON "placement"("status");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "introduction" ADD CONSTRAINT "introduction_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement" ADD CONSTRAINT "placement_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement" ADD CONSTRAINT "placement_introduction_id_fkey" FOREIGN KEY ("introduction_id") REFERENCES "introduction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement" ADD CONSTRAINT "placement_hire_id_fkey" FOREIGN KEY ("hire_id") REFERENCES "hire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
