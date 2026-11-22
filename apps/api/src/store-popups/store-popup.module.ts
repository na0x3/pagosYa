import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AiUsageModule } from '../ai-usage/ai-usage.module';
import { PopupLookService } from './popup-look.service';
import { PopupGameService } from './popup-game.service';
import { PopupDesignService } from './popup-design.service';
import { PopupEventsCleanupJob } from './popup-events-cleanup.job';

/** Spec 2026-11-09: each store's signup popup look (six built looks) and its optional game (rasca y gana, ruleta).
 *  Spec 2026-11-18 Popups 2.0: the YAPI-written design that replaces the look once one passes its checks. */
@Module({ imports: [PrismaModule, UploadsModule, AiUsageModule], providers: [PopupLookService, PopupGameService, PopupDesignService, PopupEventsCleanupJob], exports: [PopupLookService, PopupGameService, PopupDesignService] })
export class StorePopupModule {}
