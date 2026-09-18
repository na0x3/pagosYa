import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import type { NormalizedDeviceEvent, NormalizedDeviceEventType } from "@pagosya/access-control";
import { JsonFileEdgeQueueStore, OfflineEventQueue } from "./offline-queue";

const allowedTypes = new Set<NormalizedDeviceEventType>([
  "RECOGNIZED_FACE", "UNKNOWN_FACE", "SPOOF_REJECTED", "DEVICE_OFFLINE", "DEVICE_ONLINE", "ENROLLMENT_SUCCESS", "ENROLLMENT_FAILURE",
]);

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > 32_768) throw new Error("Payload exceeds 32 KiB");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizedEvent(value: unknown): NormalizedDeviceEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A normalized device event is required");
  const input = value as Record<string, unknown>;
  if (typeof input.externalEventId !== "string" || input.externalEventId.length < 8 || input.externalEventId.length > 180) throw new Error("Invalid externalEventId");
  if (typeof input.deviceId !== "string" || !input.deviceId || input.deviceId.length > 180) throw new Error("Invalid deviceId");
  if (typeof input.occurredAt !== "string" || !Number.isFinite(Date.parse(input.occurredAt))) throw new Error("Invalid occurredAt");
  if (typeof input.eventType !== "string" || !allowedTypes.has(input.eventType as NormalizedDeviceEventType)) throw new Error("Invalid eventType");
  if (input.direction !== undefined && input.direction !== "ENTRY" && input.direction !== "EXIT") throw new Error("Invalid direction");
  if (input.externalPersonId !== undefined && (typeof input.externalPersonId !== "string" || input.externalPersonId.length > 180)) throw new Error("Invalid externalPersonId");
  if (input.matchConfidence !== undefined && (typeof input.matchConfidence !== "number" || input.matchConfidence < 0 || input.matchConfidence > 1)) throw new Error("Invalid matchConfidence");
  return {
    externalEventId: input.externalEventId,
    deviceId: input.deviceId,
    occurredAt: new Date(input.occurredAt).toISOString(),
    eventType: input.eventType as NormalizedDeviceEventType,
    ...(input.direction ? { direction: input.direction as "ENTRY" | "EXIT" } : {}),
    ...(input.externalPersonId ? { externalPersonId: input.externalPersonId } : {}),
    ...(typeof input.matchConfidence === "number" ? { matchConfidence: input.matchConfidence } : {}),
    ...(typeof input.livenessPassed === "boolean" ? { livenessPassed: input.livenessPassed } : {}),
    ...(typeof input.rawVendorEventReference === "string" ? { rawVendorEventReference: input.rawVendorEventReference.slice(0, 240) } : {}),
  };
}

async function start(): Promise<void> {
  const port = positiveInteger(process.env.EDGE_PORT, 3012);
  const cloudUrl = process.env.EDGE_CLOUD_EVENTS_URL;
  const cloudToken = process.env.EDGE_CLOUD_TOKEN;
  const ingressToken = process.env.EDGE_INGEST_TOKEN;
  const intervalMs = positiveInteger(process.env.EDGE_FLUSH_INTERVAL_MS, 2_000);
  const queueFile = resolve(process.env.EDGE_QUEUE_FILE || "./data/edge-device-events.json");
  const queue = new OfflineEventQueue(new JsonFileEdgeQueueStore(queueFile));
  await queue.initialize();

  const forward = async (event: NormalizedDeviceEvent): Promise<void> => {
    if (!cloudUrl || !cloudToken) throw new Error("Cloud forwarding is not configured");
    const response = await fetch(cloudUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${cloudToken}`, "content-type": "application/json", "idempotency-key": event.externalEventId },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Cloud rejected device event (${response.status})`);
  };

  let flushing = false;
  const flush = async () => {
    if (flushing || !cloudUrl || !cloudToken) return;
    flushing = true;
    try { await queue.flush(forward); } finally { flushing = false; }
  };
  const timer = setInterval(() => void flush(), intervalMs);
  timer.unref();

  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        return sendJson(response, 200, { status: cloudUrl && cloudToken ? "ready" : "local-only", queue: queue.lag, cloudConfigured: Boolean(cloudUrl && cloudToken) });
      }
      if (request.method === "POST" && request.url === "/device-events") {
        if (ingressToken && request.headers.authorization !== `Bearer ${ingressToken}`) return sendJson(response, 401, { message: "Unauthorized" });
        const event = normalizedEvent(await readJson(request));
        await queue.enqueue(event);
        void flush();
        return sendJson(response, 202, { accepted: true, externalEventId: event.externalEventId, queue: queue.lag });
      }
      return sendJson(response, 404, { message: "Not found" });
    } catch (error) {
      return sendJson(response, 400, { message: (error as Error).message });
    }
  });

  server.listen(port, "0.0.0.0", () => {
    process.stdout.write(JSON.stringify({ level: "info", service: "pagosya-edge", message: "edge_started", port, queueFile, cloudConfigured: Boolean(cloudUrl && cloudToken) }) + "\n");
  });
  const stop = () => server.close(() => process.exit(0));
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

void start().catch((error) => {
  process.stderr.write(JSON.stringify({ level: "error", service: "pagosya-edge", message: "edge_start_failed", error: (error as Error).message }) + "\n");
  process.exitCode = 1;
});
