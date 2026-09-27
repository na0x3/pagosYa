import { Module } from "@nestjs/common";
import { StoreFeedsController } from "../extensions/feeds/store-feeds.controller";
import { StoreFeedsService } from "../extensions/feeds/store-feeds.service";
import { StoresModule } from "../stores/stores.module";
import { StoreDiscoveryController, StoreSeoController } from "./store-seo.controller";
import { StoreSeoService } from "./store-seo.service";

/** Sitemaps, robots, structured data and product feeds for published stores. */
@Module({
  imports: [StoresModule],
  controllers: [StoreSeoController, StoreDiscoveryController, StoreFeedsController],
  providers: [StoreSeoService, StoreFeedsService],
  exports: [StoreFeedsService],
})
export class StoreSeoModule {}
