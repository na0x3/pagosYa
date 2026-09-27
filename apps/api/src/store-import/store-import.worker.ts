import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { StoreImportService } from './store-import.service';

/** One import at a time per API process; a crashed run is picked up again when its lease expires. */
@Injectable()
export class StoreImportWorker {
  private busy = false;
  constructor(private readonly imports: StoreImportService) {}
  @Interval(3000)
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try { const row = await this.imports.claim(); if (row) await this.imports.run(row); }
    catch { /* The next tick retries; failures inside run() are recorded on the row. */ }
    finally { this.busy = false; }
  }
}
