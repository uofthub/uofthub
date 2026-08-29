-- CreateEnum
CREATE TYPE "Campus" AS ENUM ('UTSG', 'UTM', 'UTSC');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "campus" "Campus";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "campus" "Campus";
