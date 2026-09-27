import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { StoreImportService } from './store-import.service';

/** One import and one YAPI build at a time per API process, on separate loops so a multi-minute build never holds back
 * an import. A crashed import is picked up again when its lease expires; a stuck build expires in claimDesign(). */
@Injectable()
export class StoreImportWorker {
  private importing = false;
  private designing = false;
  constructor(private readonly store: StoreImportService) {}

  @Interval(3000)
  async imports() {
    if (this.importing) return;
    this.importing = true;
    try { const row = await this.store.claim(); if (row) await this.store.run(row); }
    catch { /* The next tick retries; failures inside run() are recorded on the row. */ }
    finally { this.importing = false; }
  }

  @Interval(5000)
  async designs() {
    if (this.designing) return;
    this.designing = true;
    try { const row = await this.store.claimDesign(); if (row) await this.store.runDesign(row); }
    catch { /* Failures inside runDesign() are recorded on the row. */ }
    finally { this.designing = false; }
  }
}
