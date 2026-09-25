-- The home feed's weekly spotlight, picked by a moderator.
CREATE TABLE "Spotlight" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "weekOf" DATE NOT NULL,
    "note" TEXT,
    "pickedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Spotlight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Spotlight_weekOf_key" ON "Spotlight"("weekOf");

ALTER TABLE "Spotlight" ADD CONSTRAINT "Spotlight_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Spotlight" ADD CONSTRAINT "Spotlight_pickedById_fkey" FOREIGN KEY ("pickedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
