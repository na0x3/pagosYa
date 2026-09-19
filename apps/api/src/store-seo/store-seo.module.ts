import { Module } from "@nestjs/common";
import { StoresModule } from "../stores/stores.module";
import { StoreDiscoveryController, StoreSeoController } from "./store-seo.controller";
import { StoreSeoService } from "./store-seo.service";

/** Sitemaps, robots, and structured data for published stores. */
@Module({
  imports: [StoresModule],
  controllers: [StoreSeoController, StoreDiscoveryController],
  providers: [StoreSeoService],
})
export class StoreSeoModule {}
