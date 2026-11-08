/*
  Warnings:

  - You are about to drop the column `method` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the `Expense` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "method";

-- DropTable
DROP TABLE "Expense";

-- DropEnum
DROP TYPE "ExpenseCategory";
