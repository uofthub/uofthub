-- Replies (one level deep) and "Helpful" votes on comments.
ALTER TABLE "Comment" ADD COLUMN "parentId" TEXT;
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CommentHelpful" (
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentHelpful_pkey" PRIMARY KEY ("commentId","userId")
);

ALTER TABLE "CommentHelpful" ADD CONSTRAINT "CommentHelpful_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommentHelpful" ADD CONSTRAINT "CommentHelpful_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
