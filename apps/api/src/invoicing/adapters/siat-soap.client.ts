import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SiatConfig } from "../../config/configuration";

export interface SiatMessage {
  codigo?: number;
  descripcion?: string;
}

export class SiatSoapError extends Error {
  constructor(
    message: string,
    readonly messages: SiatMessage[] = [],
  ) {
    super(message);
    this.name = "SiatSoapError";
  }
}

function escapeXml(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function tagPattern(tag: string): RegExp {
  return new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${tag}>`, "i");
}

function tagBlocksPattern(tag: string): RegExp {
  return new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${tag}>`, "gi");
}

export function readSiatTag(xml: string, tag: string): string | undefined {
  const match = xml.match(tagPattern(tag));
  return match ? decodeXml(match[1].trim()) : undefined;
}

export function readSiatBlocks(xml: string, tag: string): string[] {
  return Array.from(xml.matchAll(tagBlocksPattern(tag)), (match) => match[1]);
}

export function readSiatMessages(xml: string): SiatMessage[] {
  const blocks = xml.match(/<(?:[A-Za-z_][\w.-]*:)?mensajesList(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?mensajesList>/gi) ?? [];
  return blocks.map((block) => ({
    codigo: Number(readSiatTag(block, "codigo")) || undefined,
    descripcion: readSiatTag(block, "descripcion"),
  }));
}

@Injectable()
export class SiatSoapClient {
  constructor(private readonly config: ConfigService) {}

  get cfg(): SiatConfig {
    return this.config.get<SiatConfig>("app.siat")!;
  }

  async call(service: string, operation: string, requestName?: string, fields: Record<string, string | number> = {}): Promise<string> {
    if (!this.cfg.delegatedToken || !this.cfg.systemCode) {
      throw new SiatSoapError("SIAT_DELEGATED_TOKEN and SIAT_SYSTEM_CODE must be configured");
    }

    const request = requestName
      ? `<${requestName}>${Object.entries(fields)
          .map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
          .join("")}</${requestName}>`
      : "";
    const envelope =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:siat="https://siat.impuestos.gob.bo/">` +
      `<soapenv:Header/><soapenv:Body><siat:${operation}>${request}</siat:${operation}></soapenv:Body></soapenv:Envelope>`;

    const response = await fetch(`${this.cfg.baseUrl}/${service}`, {
      method: "POST",
      headers: {
        apikey: `TokenApi ${this.cfg.delegatedToken}`,
        "Content-Type": "text/xml; charset=UTF-8",
      },
      body: envelope,
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.text();
    if (!response.ok) throw new SiatSoapError(`SIAT ${service}.${operation} failed with HTTP ${response.status}`);

    const fault = readSiatTag(body, "faultstring");
    if (fault) throw new SiatSoapError(`SIAT SOAP fault: ${fault}`);
    return body;
  }
}
