-- CreateTable
CREATE TABLE "SubscriptionDay" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionDay_processed_date_idx" ON "SubscriptionDay"("processed", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionDay_subscriptionId_date_key" ON "SubscriptionDay"("subscriptionId", "date");
