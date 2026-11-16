-- «La tienda que vende sola» (spec 2026-11-16, «Mejora automática» on by default for NEW stores; final review I3): every store that
-- already exists when this release lands starts with it off — its merchant switches it on from Inicio. New stores keep the column default.
UPDATE "Store" SET "autoImprove" = false WHERE "createdAt" < NOW();
