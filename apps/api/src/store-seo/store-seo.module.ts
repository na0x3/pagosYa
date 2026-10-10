import { Module } from "@nestjs/common";
import { StoreFeedsController } from "../extensions/feeds/store-feeds.controller";
import { StoreFeedsService } from "../extensions/feeds/store-feeds.service";
import { StoresModule } from "../stores/stores.module";
import { UploadsModule } from "../uploads/uploads.module";
import { StoreFaviconController } from "./store-favicon.controller";
import { StoreFaviconService } from "./store-favicon.service";
import { StoreDiscoveryController, StoreSeoController } from "./store-seo.controller";
import { StoreSeoService } from "./store-seo.service";

/** Sitemaps, robots, structured data and product feeds for published stores. */
@Module({
  imports: [StoresModule, UploadsModule],
  controllers: [StoreSeoController, StoreDiscoveryController, StoreFeedsController, StoreFaviconController],
  providers: [StoreSeoService, StoreFeedsService, StoreFaviconService],
  exports: [StoreFeedsService],
})
export class StoreSeoModule {}
