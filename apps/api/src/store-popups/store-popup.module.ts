import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PopupLookService } from './popup-look.service';
import { PopupGameService } from './popup-game.service';

/** Spec 2026-11-09: each store's signup popup look (six built looks) and its optional game (rasca y gana, ruleta). */
@Module({ imports: [PrismaModule], providers: [PopupLookService, PopupGameService], exports: [PopupLookService, PopupGameService] })
export class StorePopupModule {}
