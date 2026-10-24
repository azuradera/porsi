import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

async function lockSubscription(
  tx: Prisma.TransactionClient,
  subscriptionId: string,
) {
  await tx.$queryRaw`
    SELECT "id"
    FROM "Subscription"
    WHERE "id" = ${subscriptionId}
    FOR UPDATE
  `;
}

function addCalendarDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function normalizeDate(date: Date) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    ),
  );
}

export async function extendSubscriptionManually(
  subscriptionId: string,
  days: number,
  reason: string,
) {
  if (!Number.isSafeInteger(days) || days < 1 || days > 365) {
    throw new Error("INVALID_EXTENSION_DAYS");
  }

  if (!reason.trim()) {
    throw new Error("EXTENSION_REASON_REQUIRED");
  }

  return prisma.$transaction(
    async (tx) => {
      await lockSubscription(tx, subscriptionId);

      const subscription = await tx.subscription.findUnique({
        where: { id: subscriptionId },
      });

      if (!subscription) {
        throw new Error("SUBSCRIPTION_NOT_FOUND");
      }

      if (subscription.status === "CANCELLED") {
        throw new Error("SUBSCRIPTION_CANCELLED");
      }

      const previousEndDate = subscription.endDate;
      const newEndDate = addCalendarDays(previousEndDate, days);

      const updatedSubscription = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          endDate: newEndDate,
          status: "ACTIVE",
        },
      });

      const extension = await tx.subscriptionExtension.create({
        data: {
          subscriptionId,
          type: "MANUAL",
          days,
          reason: reason.trim(),
          previousEndDate,
          newEndDate,
        },
      });

      return {
        subscription: updatedSubscription,
        extension,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

export async function processSubscriptionDay(
  subscriptionId: string,
  date: Date,
) {
  const day = normalizeDate(date);
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await lockSubscription(tx, subscriptionId);

          const subscription = await tx.subscription.findUnique({
            where: { id: subscriptionId },
            include: {
              customer: true,
            },
          });

          if (!subscription) {
            throw new Error("SUBSCRIPTION_NOT_FOUND");
          }

          if (
            subscription.status === "CANCELLED" ||
            subscription.customer.status !== "ACTIVE"
          ) {
            throw new Error("SUBSCRIPTION_INACTIVE");
          }

          if (
            day < normalizeDate(subscription.startDate) ||
            day > normalizeDate(subscription.endDate)
          ) {
            throw new Error("DATE_OUTSIDE_SUBSCRIPTION");
          }

          const existingDay = await tx.subscriptionDay.findUnique({
            where: {
              subscriptionId_date: {
                subscriptionId,
                date: day,
              },
            },
          });

          if (existingDay?.processed) {
            return {
              status: "SKIPPED",
              extended: false,
              reason: "DAY_ALREADY_PROCESSED",
            };
          }

          if (existingDay) {
            throw new Error("DAY_PROCESSING_INCOMPLETE");
          }

          const dayRecord = await tx.subscriptionDay.create({
            data: {
              subscriptionId,
              date: day,
              processed: false,
            },
          });

          const pickup = await tx.mealPickup.findFirst({
            where: {
              subscriptionId,
              pickupDate: day,
            },
          });

          if (pickup) {
            await tx.subscriptionDay.update({
              where: { id: dayRecord.id },
              data: { processed: true },
            });

            return {
              status: "SUCCESS",
              extended: false,
              reason: "DAY_HAS_PICKUP",
            };
          }

          const noMealDay = await tx.noMealDay.findUnique({
            where: {
              subscriptionId_date: {
                subscriptionId,
                date: day,
              },
            },
          });

          const previousEndDate = subscription.endDate;
          const newEndDate = addCalendarDays(previousEndDate, 1);

          const extension = await tx.subscriptionExtension.create({
            data: {
              subscriptionId,
              noMealDayId: noMealDay?.id,
              type: "AUTOMATIC",
              days: 1,
              reason: `unused-day:${day.toISOString().slice(0, 10)}`,
              previousEndDate,
              newEndDate,
            },
          });

          await tx.subscription.update({
            where: { id: subscriptionId },
            data: {
              endDate: newEndDate,
              status: "ACTIVE",
            },
          });

          await tx.subscriptionDay.update({
            where: { id: dayRecord.id },
            data: { processed: true },
          });

          if (noMealDay) {
            await tx.noMealDay.update({
              where: { id: noMealDay.id },
              data: { processed: true },
            });
          }

          return {
            status: "SUCCESS",
            extended: true,
            extension,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < maxAttempts
      ) {
        continue;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existingDay = await prisma.subscriptionDay.findUnique({
          where: {
            subscriptionId_date: {
              subscriptionId,
              date: day,
            },
          },
        });

        if (existingDay?.processed) {
          return {
            status: "SKIPPED",
            extended: false,
            reason: "DAY_ALREADY_PROCESSED",
          };
        }
      }

      throw error;
    }
  }

  throw new Error("SUBSCRIPTION_DAY_PROCESSING_FAILED");
}