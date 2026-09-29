-- The faculty list now uses U of T's official names for its faculties and
-- academic units. Move profiles that picked a renamed entry onto its new name.
UPDATE "User" SET "faculty" = 'Applied Science & Engineering' WHERE "faculty" = 'Engineering';
UPDATE "User" SET "faculty" = 'Management' WHERE "faculty" = 'Rotman Commerce';
UPDATE "User" SET "faculty" = 'Education' WHERE "faculty" = 'Education (OISE)';
UPDATE "User" SET "faculty" = 'University of Toronto Mississauga' WHERE "faculty" = 'UTM';
UPDATE "User" SET "faculty" = 'University of Toronto Scarborough' WHERE "faculty" = 'UTSC';
