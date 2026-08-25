import { BadRequestException, Injectable } from "@nestjs/common";
import { lookup, promises as dns } from "node:dns";
import { request } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { domainToASCII } from "node:url";

const MAX_WEBHOOK_URL_LENGTH = 2_048;
const MAX_RESPONSE_HEADER_BYTES = 16_384;
const WEBHOOK_TIMEOUT_MS = 10_000;

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  return octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? octets : null;
}

function isPublicIpv4(address: string): boolean {
  const octets = parseIpv4(address);
  if (!octets) return false;
  const [a, b, c] = octets;

  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function expandIpv6(address: string): number[] | null {
  const withoutZone = address.split("%")[0].toLowerCase();
  if (withoutZone.includes(".")) {
    const lastColon = withoutZone.lastIndexOf(":");
    const ipv4 = parseIpv4(withoutZone.slice(lastColon + 1));
    if (!ipv4) return null;
    const replacement = `${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
    return expandIpv6(`${withoutZone.slice(0, lastColon)}:${replacement}`);
  }

  const halves = withoutZone.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (missing < 0 || (halves.length === 1 && left.length !== 8)) return null;
  const words = [...left, ...Array(missing).fill("0"), ...right].map((part) => Number.parseInt(part, 16));
  return words.length === 8 && words.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff)
    ? words
    : null;
}

function isPublicIpv6(address: string): boolean {
  const words = expandIpv6(address);
  if (!words) return false;
  const allZero = words.every((word) => word === 0);
  const loopback = words.slice(0, 7).every((word) => word === 0) && words[7] === 1;
  const ipv4Mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (ipv4Mapped) {
    return isPublicIpv4(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`);
  }

  const first = words[0];
  return !(
    allZero ||
    loopback ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    (first === 0x2001 && words[1] === 0x0db8) ||
    (first === 0x2001 && words[1] === 0) ||
    first === 0x2002 ||
    (first === 0x0064 && words[1] === 0xff9b)
  );
}

export function isPublicNetworkAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function parseWebhookUrl(input: string): URL {
  if (typeof input !== "string" || !input.trim() || input.length > MAX_WEBHOOK_URL_LENGTH) {
    throw new BadRequestException("Webhook URL is invalid");
  }

  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new BadRequestException("Webhook URL is invalid");
  }

  const hostname = domainToASCII(parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase());
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    (parsed.port && parsed.port !== "443") ||
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new BadRequestException("Webhook URLs must use public HTTPS endpoints without credentials or fragments");
  }
  parsed.hostname = hostname;
  return parsed;
}

export async function validateWebhookUrl(input: string): Promise<string> {
  const parsed = parseWebhookUrl(input);
  const literalFamily = isIP(parsed.hostname);
  if (literalFamily && !isPublicNetworkAddress(parsed.hostname)) {
    throw new BadRequestException("Webhook URL cannot target a private or reserved network");
  }
  if (!literalFamily) {
    let addresses: Array<{ address: string; family: number }>;
    try {
      addresses = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
    } catch {
      throw new BadRequestException("Webhook hostname could not be resolved");
    }
    if (!addresses.length || addresses.some(({ address }) => !isPublicNetworkAddress(address))) {
      throw new BadRequestException("Webhook hostname resolves to a private or reserved network");
    }
  }
  return parsed.toString();
}

const safeLookup: LookupFunction = (hostname, options, callback) => {
  const lookupOptions = typeof options === "number" ? { family: options } : { ...options, all: false };
  lookup(hostname, lookupOptions, (error, address, family) => {
    if (error) return callback(error, address, family);
    if (typeof address !== "string" || !isPublicNetworkAddress(address)) {
      return callback(new Error("Webhook DNS resolved to a private or reserved network"), address as string, family);
    }
    callback(null, address, family);
  });
};

@Injectable()
export class WebhookHttpClient {
  async post(url: string, body: string, headers: Record<string, string>): Promise<{ ok: boolean; status: number }> {
    const parsed = parseWebhookUrl(url);
    return new Promise((resolve, reject) => {
      const outgoing = request(
        parsed,
        {
          method: "POST",
          headers: { ...headers, "content-length": Buffer.byteLength(body).toString() },
          lookup: safeLookup,
          maxHeaderSize: MAX_RESPONSE_HEADER_BYTES,
          agent: false,
        },
        (response) => {
          const status = response.statusCode ?? 0;
          response.destroy();
          resolve({ ok: status >= 200 && status < 300, status });
        },
      );
      outgoing.setTimeout(WEBHOOK_TIMEOUT_MS, () => outgoing.destroy(new Error("Webhook request timed out")));
      outgoing.once("error", reject);
      outgoing.end(body);
    });
  }
}
