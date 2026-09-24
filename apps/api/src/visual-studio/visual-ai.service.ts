import { AiUsageService } from '../ai-usage/ai-usage.service';
import { Optional } from '@nestjs/common';
import { BrandProfileService } from '../brand/brand-profile.service';
import { brandContext } from '../brand/brand-profile';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MediaAsset } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MAX_IMAGE_UPLOAD_BYTES, UploadsService } from "../uploads/uploads.service";
import { type StoreAgentImageRequest } from "./agent-revision";

/** Model and image-generation calls for the visual editor, metered per store. */
@Injectable()
export class VisualAiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly config: ConfigService,
    @Optional() private readonly brands?: BrandProfileService,
    @Optional() private readonly metering?: AiUsageService,
  ) {}

  async meteredRequest(storeId: string | undefined, stage: string, model: string, url: string, init: RequestInit) {
    const started = Date.now(); let body: any = null; let status = 'FAILED';
    try {
      const response = await fetch(url, init);
      body = await response.json();
      if (response.ok && (!body.status || body.status === 'completed')) status = 'COMPLETED';
      return { response, body };
    } finally { if (storeId) await this.metering?.record(storeId, stage, model, body, Date.now() - started, status); }
  }
  canPlanStorefrontOperations(): boolean {
    return Boolean(this.config.get<boolean>("app.openAi.enabled") && this.config.get<string>("app.openAi.apiKey"));
  }
  canGenerateStorefrontImages(): boolean {
    return Boolean(
      this.config.get<boolean>("app.openAi.enabled")
      && this.config.get<string>("app.openAi.apiKey")
      && this.config.get<string>("app.openAi.imageModel"),
    );
  }
  async generateStorefrontImage(
    merchantId: string,
    storeId: string,
    storeName: string,
    request: Pick<StoreAgentImageRequest, "prompt" | "aspectRatio">,
    context = "",
    allowProductRepresentation = false,
  ): Promise<MediaAsset> {
    if (!this.canGenerateStorefrontImages()) {
      throw new ServiceUnavailableException("La generación de imágenes de Yapi no está configurada en este momento.");
    }
    const brand = await this.brands?.get(merchantId, storeId);
    const prompt = [
      brand ? `Identidad confirmada: ${brandContext(brand.data)}` : '',
      `Crea una fotografía editorial original para el sitio web de ${storeName}.`,
      request.prompt,
      context,
      allowProductRepresentation
        ? "Representa únicamente el producto descrito literalmente por el comercio. No inventes materiales, ingredientes, funciones, empaque, texto, logotipo, beneficios ni afirmaciones que no estén en la descripción."
        : "Debe funcionar como atmósfera visual de marca y dejar espacio útil para texto de interfaz.",
      allowProductRepresentation
        ? "Fotografía de producto limpia y compatible con una galería comercial. Sin marcas ajenas, texto legible, interfaz, precios, descuentos, certificaciones, sellos ni marcas de agua."
        : "No representes un producto específico ni inventes características del negocio. Sin logotipos, marcas ajenas, texto legible, interfaz, precios, descuentos, certificaciones, sellos ni marcas de agua.",
    ].filter(Boolean).join("\n");
    const size = request.aspectRatio === "portrait" ? "1024x1536" : request.aspectRatio === "square" ? "1024x1024" : "1536x1024";
    let response: Response; let body: any;
    try {
      ({ response, body } = await this.meteredRequest(storeId, 'visual-image', this.config.get<string>('app.openAi.imageModel') ?? 'gpt-image-2', "https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.get<string>("app.openAi.apiKey")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.get<string>("app.openAi.imageModel") ?? "gpt-image-2",
          prompt,
          n: 1,
          size,
          quality: "medium",
          output_format: "jpeg",
          output_compression: 86,
          moderation: "auto",
        }),
        signal: AbortSignal.timeout(150_000),
      }));
    } catch (error) {
      throw new ServiceUnavailableException(`No pudimos generar la imagen en este momento: ${(error as Error).message}`);
    }
    if (!response.ok) {
      if (body.error?.code === "moderation_blocked") {
        throw new BadRequestException("La imagen solicitada no pudo generarse de forma segura. Describe otra escena editorial sin personas identificables, logos ni afirmaciones.");
      }
      throw new BadGatewayException(body.error?.message || "El proveedor de imágenes no devolvió una imagen utilizable.");
    }
    const encoded = body.data?.[0]?.b64_json;
    if (!encoded) throw new BadGatewayException("El proveedor de imágenes no devolvió una imagen utilizable.");
    const buffer = Buffer.from(encoded, "base64");
    if (!buffer.length || buffer.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
      throw new BadGatewayException("La imagen generada no tiene un tamaño compatible con la biblioteca de la tienda.");
    }
    const stored = await this.uploads.saveBuffer(buffer, "image/jpeg");
    try {
      return await this.prisma.mediaAsset.create({
        data: {
          merchantId,
          storeId,
          url: stored.url,
          storageKey: stored.filename,
          kind: "AI_DERIVED",
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
        },
      });
    } catch (error) {
      await this.uploads.deleteFiles([stored.url]);
      throw error;
    }
  }
}
