import type { NormalizedDeviceEvent } from "@pagosya/access-control";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface QueuedDeviceEvent {
  event: NormalizedDeviceEvent;
  attempts: number;
  nextAttemptAt: number;
  queuedAt: number;
}

export interface EdgeQueueStore {
  load(): Promise<QueuedDeviceEvent[]>;
  save(events: ReadonlyArray<QueuedDeviceEvent>): Promise<void>;
}

export class InMemoryEdgeQueueStore implements EdgeQueueStore {
  events: QueuedDeviceEvent[] = [];
  async load(): Promise<QueuedDeviceEvent[]> { return this.events.map((entry) => ({ ...entry })); }
  async save(events: ReadonlyArray<QueuedDeviceEvent>): Promise<void> { this.events = events.map((entry) => ({ ...entry })); }
}

/** Crash-tolerant local persistence for venue machines. The file contains normalized
 * identifiers only; face images and templates are never accepted by this queue. */
export class JsonFileEdgeQueueStore implements EdgeQueueStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<QueuedDeviceEvent[]> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isQueuedDeviceEvent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async save(events: ReadonlyArray<QueuedDeviceEvent>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(events), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }
}

function isQueuedDeviceEvent(value: unknown): value is QueuedDeviceEvent {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const event = item.event as Record<string, unknown> | undefined;
  return Boolean(event && typeof event.externalEventId === "string" && typeof event.deviceId === "string"
    && typeof event.occurredAt === "string" && typeof event.eventType === "string"
    && Number.isFinite(item.attempts) && Number.isFinite(item.nextAttemptAt) && Number.isFinite(item.queuedAt));
}

export class OfflineEventQueue {
  private events: QueuedDeviceEvent[] = [];
  constructor(private readonly store: EdgeQueueStore) {}

  async initialize(): Promise<void> {
    const loaded = await this.store.load();
    const unique = new Map(loaded.map((entry) => [entry.event.externalEventId, entry]));
    this.events = [...unique.values()];
  }

  async enqueue(event: NormalizedDeviceEvent): Promise<void> {
    if (this.events.some((entry) => entry.event.externalEventId === event.externalEventId)) return;
    this.events.push({ event: { ...event }, attempts: 0, nextAttemptAt: 0, queuedAt: Date.now() });
    await this.store.save(this.events);
  }

  async flush(send: (event: NormalizedDeviceEvent) => Promise<void>, now = Date.now()): Promise<{ sent: number; pending: number }> {
    let sent = 0;
    for (const entry of [...this.events]) {
      if (entry.nextAttemptAt > now) continue;
      try {
        await send(entry.event);
        this.events = this.events.filter((candidate) => candidate.event.externalEventId !== entry.event.externalEventId);
        sent += 1;
      } catch {
        entry.attempts += 1;
        entry.nextAttemptAt = now + Math.min(60_000, 1_000 * 2 ** Math.min(entry.attempts, 6));
      }
    }
    await this.store.save(this.events);
    return { sent, pending: this.events.length };
  }

  get lag(): { pending: number; oldestQueuedAt: number | null } {
    return { pending: this.events.length, oldestQueuedAt: this.events.length ? Math.min(...this.events.map((entry) => entry.queuedAt)) : null };
  }
}
