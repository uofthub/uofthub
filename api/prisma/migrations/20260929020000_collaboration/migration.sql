-- What a collaborator did, shown beside their name.
ALTER TABLE "ProjectCollaborator" ADD COLUMN "title" TEXT;

-- Declined invitations used to linger as accepted = false, which looked
-- exactly like a pending one. From here on they are deleted; nothing earlier
-- can be told apart, so existing rows are left as they are.

CREATE TABLE "ProjectEmailInvite" (
    "projectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "title" TEXT,
    "invitedById" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectEmailInvite_pkey" PRIMARY KEY ("projectId","email")
);

CREATE INDEX "ProjectEmailInvite_email_idx" ON "ProjectEmailInvite"("email");

ALTER TABLE "ProjectEmailInvite" ADD CONSTRAINT "ProjectEmailInvite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectEmailInvite" ADD CONSTRAINT "ProjectEmailInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
