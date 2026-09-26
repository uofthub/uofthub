-- Group storage quotas were removed in the redesign (see docs/redesign.md
-- § Student groups and quotas). The per-term grant ledger and the group a
-- file was billed to were kept dormant until the decision held; nothing has
-- read or written either since.
DROP TABLE "OrgStorageGrant";

DROP INDEX "ProjectFile_orgId_idx";
ALTER TABLE "ProjectFile" DROP CONSTRAINT "ProjectFile_orgId_fkey";
ALTER TABLE "ProjectFile" DROP COLUMN "orgId";
