ALTER TABLE "Store"
ADD COLUMN "motionExperiences" JSONB NOT NULL DEFAULT '["coverflow-carousel"]';

UPDATE "Store"
SET "motionExperiences" = jsonb_build_array("motionExperience");
