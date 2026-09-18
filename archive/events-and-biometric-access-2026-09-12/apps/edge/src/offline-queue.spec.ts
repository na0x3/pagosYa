import type { NormalizedDeviceEvent } from "@pagosya/access-control";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryEdgeQueueStore, JsonFileEdgeQueueStore, OfflineEventQueue } from "./offline-queue";

const event: NormalizedDeviceEvent = { externalEventId: "global-1", deviceId: "device-1", occurredAt: new Date().toISOString(), eventType: "RECOGNIZED_FACE", externalPersonId: "person-1", direction: "ENTRY" };

describe("OfflineEventQueue", () => {
  it("replays after failure without queueing duplicate device events", async () => {
    const store = new InMemoryEdgeQueueStore();
    const queue = new OfflineEventQueue(store);
    await queue.initialize();
    await queue.enqueue(event);
    await queue.enqueue(event);
    await queue.flush(async () => { throw new Error("offline"); }, 1_000);
    expect(queue.lag.pending).toBe(1);
    const received: string[] = [];
    await queue.flush(async (current) => { received.push(current.externalEventId); }, 100_000);
    expect(received).toEqual(["global-1"]);
    expect(queue.lag.pending).toBe(0);
  });

  it("survives a process restart using an owner-only local queue file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pagosya-edge-"));
    const file = join(directory, "queue.json");
    const first = new OfflineEventQueue(new JsonFileEdgeQueueStore(file));
    await first.initialize();
    await first.enqueue(event);
    expect(JSON.parse(await readFile(file, "utf8"))).toHaveLength(1);

    const restarted = new OfflineEventQueue(new JsonFileEdgeQueueStore(file));
    await restarted.initialize();
    const sent: string[] = [];
    await restarted.flush(async (current) => { sent.push(current.externalEventId); });
    expect(sent).toEqual(["global-1"]);
    expect(restarted.lag.pending).toBe(0);
  });
});
