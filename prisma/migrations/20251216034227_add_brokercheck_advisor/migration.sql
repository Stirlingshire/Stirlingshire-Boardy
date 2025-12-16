-- CreateTable
CREATE TABLE "brokercheck_advisor" (
    "id" UUID NOT NULL,
    "crd_number" BIGINT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "firm_crd" BIGINT NOT NULL,
    "firm_name" TEXT NOT NULL,
    "first_seen" TIMESTAMPTZ NOT NULL,
    "last_seen" TIMESTAMPTZ NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "brokercheck_advisor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brokercheck_advisor_crd_number_key" ON "brokercheck_advisor"("crd_number");

-- CreateIndex
CREATE INDEX "brokercheck_advisor_firm_crd_idx" ON "brokercheck_advisor"("firm_crd");

-- CreateIndex
CREATE INDEX "brokercheck_advisor_is_active_idx" ON "brokercheck_advisor"("is_active");
