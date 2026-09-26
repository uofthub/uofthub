-- One view per person per project per day.
--
-- Every GET used to count — including the page's own refetches, a student
-- reloading, and crawlers — so the number rewarded noise. A view now counts
-- only the first time that viewer is seen that day. See ProjectViewer.
CREATE TABLE "ProjectViewer" (
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "viewerKey" TEXT NOT NULL,

    CONSTRAINT "ProjectViewer_pkey" PRIMARY KEY ("projectId","date","viewerKey")
);

ALTER TABLE "ProjectViewer" ADD CONSTRAINT "ProjectViewer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
