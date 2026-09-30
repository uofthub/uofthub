-- CreateTable
CREATE TABLE "CampaignScan" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitorHash" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,

    CONSTRAINT "CampaignScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignScan_source_createdAt_idx" ON "CampaignScan"("source", "createdAt");
