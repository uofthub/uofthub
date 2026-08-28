/*
  Warnings:

  - You are about to drop the column `url` on the `ProjectFile` table. All the data in the column will be lost.
  - Added the required column `storageKey` to the `ProjectFile` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ProjectFile" DROP COLUMN "url",
ADD COLUMN     "storageKey" TEXT NOT NULL;
