import { creditQuote, reserveCredit } from '../commerce-platform/credit-ledger';
import { bestBundleDiscount, type Bundle } from './bundle-pricing';
import { quoteShipping } from '../shipping/shipping-rates';
import { BadRequestException, Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MerchantStatus, OrderFulfillmentStatus, PaymentLinkStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { findActiveStoreBySlug } from "./active-store";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { CartCheckoutDto } from "../payment-links/dto/cart-checkout.dto";
import { SubmitStoreLeadDto } from "./dto/submit-store-lead.dto";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { PromoCodesService } from "../promo-codes/promo-codes.service";
import { createOrderTrackingToken } from "../consumer/order-tracking-token";
import type { ProductVariant } from '../payment-links/product-variants';
import { pickedProductQuantities, resolveSelectedExtras, selectedExtrasLabel } from '../payment-links/product-extras';
import type { CartItemDto } from '../payment-links/dto/cart-checkout.dto';
import { readStoreLocations, readLocationStocks, nextStoreLocationOpenAt } from "./store-locations";
import { readProductExtras, readProductVariants, type ProductExtra, discountedProductAmount, selectedExtrasAmount } from "./product-pricing";
import { InboxService } from "../inbox/inbox.service";

const MAX_DESCRIPTION_LENGTH = 480;
const DEVELOPMENT_ORDER_TRACKING_SECRET = "development-only-order-tracking-secret-change-me";

/** Buying from a store: cart checkout into a payment intent, and WhatsApp/contact leads, both checked against live stock. */
@Injectable()
export class StoreCheckoutService {
  private readonly logger = new Logger(StoreCheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentIntents: PaymentIntentsService,
    @Optional() @Inject(EMAIL_PROVIDER) private readonly emailProvider?: EmailProvider,
    @Optional() private readonly promoCodes?: PromoCodesService,
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly inbox?: InboxService,
  ) {}

  /** Box picks consume their linked product's stock: load the linked products that are not
   * already cart lines, and count every pick (× line quantity) toward each product. */
  private async pickedProductStock(storeId: string, links: Array<{ id: string; extras: Prisma.JsonValue }>, items: CartItemDto[]) {
    const linksById = new Map(links.map((link) => [link.id, link]));
    const picked = pickedProductQuantities(items, (item) => readProductExtras(linksById.get(item.paymentLinkId)?.extras ?? []));
    const missing = [...picked.keys()].filter((id) => !linksById.has(id));
    const linked = missing.length
      ? await this.prisma.paymentLink.findMany({ where: { id: { in: missing }, storeId, status: PaymentLinkStatus.ACTIVE } })
      : [];
    for (const id of missing) {
      if (linked.some((link) => link.id === id)) continue;
      const name = links.flatMap((link) => readProductExtras(link.extras)).find((extra) => extra.productId === id)?.name;
      throw new BadRequestException(`"${name ?? "Un producto de la caja"}" ya no está disponible`);
    }
    return { picked, linked };
  }
  /** Public — turns a cart (one or more items, from the same store as `slug`) into a
   * single PaymentIntent, i.e. one payment/one QR for the whole cart. */
  async createCartCheckout(slug: string, dto: CartCheckoutDto, quoteOnly = false) {
    const store = await findActiveStoreBySlug(this.prisma, slug);
    if (store.checkoutMode === "whatsapp" || store.checkoutMode === "external") {
      throw new BadRequestException("Esta tienda no tiene habilitados los pagos integrados");
    }
    const funnelVisit = !quoteOnly && dto.funnelToken ? await this.prisma.storeFunnelVisit.findFirst({ where: { token: dto.funnelToken, storeId: store.id, createdAt: { gte: new Date(Date.now() - 86400000) } }, select: { id: true } }) : null;
    const sourceVisit = dto.sourceVisitToken ? await this.prisma.storeSourceVisit.findFirst({ where: { token: dto.sourceVisitToken, createdAt: { gte: new Date(Date.now() - 30 * 86400000) }, experiment: { storeId: store.id } }, select: { id: true } }) : null;
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: store.merchantId } });

    const quantityByLinkId = new Map<string, number>();
    for (const item of dto.items) {
      quantityByLinkId.set(item.paymentLinkId, (quantityByLinkId.get(item.paymentLinkId) ?? 0) + item.quantity);
    }

    const links = await this.prisma.paymentLink.findMany({
      where: { id: { in: [...quantityByLinkId.keys()] }, storeId: store.id, status: PaymentLinkStatus.ACTIVE },
    });
    if (links.length !== quantityByLinkId.size) {
      throw new BadRequestException("Uno o más productos del carrito ya no están disponibles");
    }

    const digitalOnly = links.every(link => link.fulfillmentType === 'DIGITAL');
    const digitalAssets = store.digitalGoodsEnabled ? await this.prisma.digitalAsset.findMany({ where: { storeId: store.id, productId: { in: links.map(link => link.id) }, active: true }, select: { id: true, productId: true } }) : [];
    for (const link of links) if (link.fulfillmentType === 'DIGITAL' && !digitalAssets.some(asset => asset.productId === link.id)) throw new BadRequestException(`El archivo de "${link.name}" no está disponible.`);
    const locations = digitalOnly ? [] : readStoreLocations(store.locations);
    const fulfillmentLocation = locations.length ? locations.find((location) => location.id === dto.locationId) : undefined;
    if (locations.length && !fulfillmentLocation) throw new BadRequestException("Elige una ubicación para tu pedido");
    if (fulfillmentLocation && dto.fulfillmentMethod === "pickup" && !fulfillmentLocation.pickupEnabled) throw new BadRequestException("Esta ubicación no ofrece retiro");
    if (fulfillmentLocation && dto.fulfillmentMethod === "delivery" && !fulfillmentLocation.deliveryEnabled) throw new BadRequestException("Esta ubicación no ofrece entrega");
    if (fulfillmentLocation && !dto.fulfillmentMethod) throw new BadRequestException("Elige retiro o entrega");
    const fulfillmentReadyAt = fulfillmentLocation ? nextStoreLocationOpenAt(fulfillmentLocation) : null;

    const currency = links[0].currency;
    if (links.some((l) => l.currency !== currency)) {
      throw new BadRequestException("Todos los productos del carrito deben usar la misma moneda");
    }

    // Soft check here (a real reservation would need a lock) — the hard
    // guarantee against overselling is the atomic decrement on payment
    // success (see PaymentIntentsService.applyRailResult), which never lets
    // stock go negative even if two carts race past this check.
    const { picked, linked } = await this.pickedProductStock(store.id, links, dto.items);
    for (const l of [...links, ...linked]) {
      const requested = (quantityByLinkId.get(l.id) ?? 0) + (picked.get(l.id) ?? 0);
      if (quantityByLinkId.has(l.id) && fulfillmentLocation && l.fulfillmentType !== 'DIGITAL') {
        const branchStock = readLocationStocks(l.locationStocks)[fulfillmentLocation.id] ?? 0;
        if (branchStock !== null && branchStock < requested) {
          throw new BadRequestException(`La ubicación ${fulfillmentLocation.name} no tiene suficiente stock de "${l.name}"`);
        }
      }
      if (l.stock !== null && l.stock < requested) {
        throw new BadRequestException(`Solo quedan ${l.stock} unidades de "${l.name}"`);
      }
    }

    const linksById = new Map(links.map((link) => [link.id, link]));
    const selectedLines = new Map<
      string,
      {
        paymentLinkId: string;
        variantId?: string;
        name: string;
        variantName?: string;
        extraIds?: string[];
        extras?: ProductExtra[];
        quantity: number;
        unitAmount: number;
        optionStock?: number | null;
        digitalAssetIds?: string[];
      }
    >();
    for (const item of dto.items) {
      const link = linksById.get(item.paymentLinkId)!;
      const variants = readProductVariants(link.variants);
      const extras = readProductExtras(link.extras);
      let variant: ProductVariant | undefined;
      if (variants.length > 0) {
        if (!item.variantId) throw new BadRequestException(`Elige una opción para "${link.name}"`);
        variant = variants.find((candidate) => candidate.id === item.variantId);
        if (!variant) throw new BadRequestException(`Una opción de "${link.name}" ya no está disponible`);
      } else if (item.variantId) {
        throw new BadRequestException(`"${link.name}" no tiene opciones`);
      }

      const selectedExtras = resolveSelectedExtras(link.name, extras, item.extraIds);
      const selectedExtraIds = selectedExtras.map((extra) => extra.id);
      const exhaustedExtra = selectedExtras.find((extra) => extra.stock === 0);
      if (exhaustedExtra) throw new BadRequestException(`"${exhaustedExtra.name}" está agotado`);

      const lineKey = `${link.id}:${variant?.id ?? "base"}:${selectedExtraIds.join("+")}`;
      const existing = selectedLines.get(lineKey);
      if (existing) existing.quantity += item.quantity;
      else {
        selectedLines.set(lineKey, {
          paymentLinkId: link.id,
          ...(link.fulfillmentType === 'DIGITAL' ? { digitalAssetIds: digitalAssets.filter(asset => asset.productId === link.id).map(asset => asset.id) } : {}),
          ...(variant && { variantId: variant.id, variantName: variant.name }),
          ...(variant && variant.stock !== undefined && { optionStock: variant.stock }),
          ...(selectedExtraIds.length && { extraIds: selectedExtraIds, extras: selectedExtras }),
          name: link.name,
          quantity: item.quantity,
          unitAmount: discountedProductAmount(link, variant?.amount ?? link.amount) + selectedExtrasAmount(selectedExtras),
        });
      }
    }

    for (const line of selectedLines.values()) {
      if (line.optionStock !== undefined && line.optionStock !== null && line.quantity > line.optionStock) {
        throw new BadRequestException(`Solo quedan ${line.optionStock} unidades de "${line.name} (${line.variantName})"`);
      }
    }

    const requestedByExtraPool = new Map<string, { quantity: number; stock: number; name: string }>();
    for (const line of selectedLines.values()) {
      for (const extra of line.extras ?? []) {
        if (!extra.inventoryKey || extra.stock === undefined) continue;
        const requested = requestedByExtraPool.get(extra.inventoryKey);
        requestedByExtraPool.set(extra.inventoryKey, {
          quantity: (requested?.quantity ?? 0) + line.quantity,
          stock: Math.min(requested?.stock ?? extra.stock, extra.stock),
          name: extra.inventoryName || extra.name,
        });
      }
    }
    for (const { quantity, stock, name } of requestedByExtraPool.values()) {
      if (quantity > stock) throw new BadRequestException(`Ya no hay suficiente stock de "${name}"`);
    }

    const cartLines = [...selectedLines.values()].map(({ optionStock: _optionStock, ...line }) => line);
    const subtotal = cartLines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0);
    const promo = dto.promoCode ? await this.promoCodes!.resolveActiveForStore(store.id, dto.promoCode) : null;
    const promoDiscountAmount = promo
      ? this.promoCodes!.discountAmount(subtotal, promo.discountType, promo.discountValue)
      : 0;
    const bundles = store.bundlesEnabled ? await this.prisma.storeBundle.findMany({ where: { storeId: store.id, active: true } }) : [];
    const bundle = bestBundleDiscount(bundles as unknown as Bundle[], cartLines);
    const discountAmount = Math.max(promoDiscountAmount, bundle.amount);
    let shipping: { id: string; name: string; amount: number; currency: string } | null = null;
    let shippingOptions: Array<{ id: string; name: string; amount: number; currency: string }> = [];
    if (store.shippingEnabled && !digitalOnly) {
      if (!quoteOnly && !dto.fulfillmentMethod) throw new BadRequestException('Elige retiro o envío.');
      if (dto.fulfillmentMethod === 'pickup' && !store.shippingPickupEnabled) throw new BadRequestException('Esta tienda no ofrece retiro.');
      const weightGrams = links.some(link => link.shippingWeightGrams == null) ? null : links.reduce((sum, link) => sum + link.shippingWeightGrams! * quantityByLinkId.get(link.id)!, 0);
      const rates = await this.prisma.deliveryZone.findMany({ where: { storeId: store.id, isActive: true } });
      const quote = quoteShipping(rates, { shippingCountry: dto.shippingCountry, shippingPostalCode: dto.shippingPostalCode, zoneId: dto.fulfillmentMethod === 'pickup' ? undefined : dto.shippingZoneId, currency, subtotal: subtotal - discountAmount, weightGrams });
      shippingOptions = quote.options;
      if (dto.fulfillmentMethod === 'delivery') {
        shipping = quote.selected;
        if (!quoteOnly && (!shipping || !dto.shippingAddress?.trim())) throw new BadRequestException('Elige una opción de envío y escribe la dirección.');
      }
    } else if (dto.shippingZoneId && !digitalOnly) throw new BadRequestException('Esta tienda no tiene tarifas de envío activadas.');
    const shippingAmount = shipping?.amount ?? 0;
    const amount = subtotal - discountAmount + shippingAmount;
    if (dto.creditCode && !store.creditsEnabled) throw new BadRequestException('Esta tienda no acepta códigos de saldo.');
    const creditAmount = dto.creditCode ? (await creditQuote(this.prisma, store.id, dto.creditCode, currency, amount)).amount : 0;
    if (quoteOnly) return { orderTotal: amount, creditAmount, subtotal, discountAmount, shippingAmount, amount: amount - creditAmount, currency, shippingOptions, shippingEnabled: store.shippingEnabled && !digitalOnly, pickupEnabled: store.shippingPickupEnabled };


    let description = cartLines
      .map((line) => `${line.name}${line.variantName ? ` (${line.variantName})` : ""}${line.extras?.length ? ` + ${selectedExtrasLabel(line.extras)}` : ""} x${line.quantity}`)
      .join(", ");
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      description = description.slice(0, MAX_DESCRIPTION_LENGTH - 1) + "…";
    }

    // Snapshot the server-owned rate on the order; later edits cannot change it.
    const partner = dto.partnerCode ? await this.prisma.storePartner.findFirst({
      where: { storeId: store.id, code: dto.partnerCode, active: true },
    }) : null;
    const livemode = merchant.status === MerchantStatus.ACTIVE;
    const checkout = await this.prisma.$transaction(async (tx) => {
      let created = await this.paymentIntents.createInTransaction(tx, store.merchantId, livemode, {
        amount,
        currency,
        description,
        metadata: {
          cart: cartLines,
          storeId: store.id,
          ...(shipping ? { shipping: { ...shipping, address: dto.shippingAddress!.trim(), ...(dto.shippingCountry ? { country: dto.shippingCountry } : {}), ...(dto.shippingPostalCode ? { postalCode: dto.shippingPostalCode } : {}) }, subtotal } : {}),
          ...(fulfillmentLocation ? { fulfillment: { locationId: fulfillmentLocation.id, locationName: fulfillmentLocation.name, method: dto.fulfillmentMethod, ...(dto.fulfillmentMethod === 'delivery' && dto.shippingAddress?.trim() ? { address: dto.shippingAddress.trim() } : {}), ...(fulfillmentReadyAt ? { readyAt: fulfillmentReadyAt.toISOString() } : {}) } } : {}),
          ...(bundle.amount > promoDiscountAmount ? { bundle: { id: bundle.id, name: bundle.name, discountAmount: bundle.amount }, subtotal } : {}),
          ...(promo && promoDiscountAmount >= bundle.amount ? {
            promoCode: promo.code,
            promoDiscountType: promo.discountType,
            promoDiscountValue: promo.discountValue,
            promoDiscountAmount,
            subtotal,
          } : {}),
        },
      });
      if (dto.creditCode) {
        const applied = await reserveCredit(tx, created.id, store.id, dto.creditCode, currency, amount);
        created = await tx.paymentIntent.update({ where: { id: created.id }, data: { amount: amount - applied, metadata: { ...(created.metadata as Prisma.JsonObject), storeCredit: { amount: applied, orderTotal: amount } } } });
      }
      const order = await tx.storeOrder.create({
        data: {
          paymentIntentId: created.id,
          ...(sourceVisit ? { sourceVisitId: sourceVisit.id } : {}),
          ...(funnelVisit ? { funnelVisitId: funnelVisit.id } : {}),
          ...(partner ? { partnerId: partner.id, partnerCommissionBps: partner.commissionBps } : {}),
          merchantId: store.merchantId,
          storeId: store.id,
          storeName: store.name,
          ...(!fulfillmentLocation && store.shippingEnabled && !digitalOnly ? { fulfillmentMethod: dto.fulfillmentMethod } : {}),
          ...(fulfillmentLocation ? {
            fulfillmentLocationId: fulfillmentLocation.id,
            fulfillmentLocationName: fulfillmentLocation.name,
            fulfillmentMethod: dto.fulfillmentMethod,
            ...(fulfillmentReadyAt ? { fulfillmentReadyAt } : {}),
          } : {}),
          items: cartLines as Prisma.InputJsonValue,
          amount,
          currency,
          statusEvents: { create: { status: OrderFulfillmentStatus.AWAITING_PAYMENT } },
        },
      });
      if (shipping) await tx.deliveryAssignment.create({ data: { merchantId: store.merchantId, storeId: store.id, orderId: order.id, zoneId: shipping.id, fee: shipping.amount, address: dto.shippingAddress!.trim() } });
      if (created.amount === 0 && dto.creditCode) created = await this.paymentIntents.completeCreditPaymentInTransaction(tx, created.id);
      return { intent: created, orderId: order.id };
    });

    const trackingSecret = this.config?.get<string>("app.orderTrackingSecret") ?? DEVELOPMENT_ORDER_TRACKING_SECRET;

    return {
      ...checkout.intent,
      trackingToken: createOrderTrackingToken(checkout.orderId, trackingSecret),
      storeName: store.name,
      cartDescription: description,
      contactPhone: store.contactPhone,
      contactEmail: store.contactEmail,
      ...(!fulfillmentLocation && store.shippingEnabled && !digitalOnly ? { fulfillmentMethod: dto.fulfillmentMethod } : {}),
      ...(fulfillmentLocation ? { fulfillmentLocationName: fulfillmentLocation.name, fulfillmentMethod: dto.fulfillmentMethod } : {}),
    };
  }
  /** Public lead capture for stores that finish outside the pagosYa payment flow.
   * The browser only submits product ids; names and prices are resolved again
   * from this store so the notification cannot be used to spoof its catalog. */
  async submitLead(slug: string, dto: SubmitStoreLeadDto) {
    const store = await findActiveStoreBySlug(this.prisma, slug);

    const isContactMessage = dto.items.length === 0;
    if (isContactMessage && !store.contactFormEnabled) {
      throw new BadRequestException("El formulario de contacto no está habilitado para esta tienda");
    }
    const customerName = dto.name?.trim() || "Cliente interesado";
    const customerEmail = dto.email.trim().toLowerCase();
    const customerPhone = dto.phone?.trim() || "";
    if (isContactMessage && !dto.message?.trim()) {
      throw new BadRequestException("Escribe un mensaje");
    }
    if (!isContactMessage && store.checkoutMode === "payment" && (!dto.name?.trim() || !customerPhone)) {
      throw new BadRequestException("Escribe tu nombre y WhatsApp para confirmar el pedido gratis");
    }
    const locations = readStoreLocations(store.locations);
    const fulfillmentLocation = !isContactMessage && locations.length
      ? locations.find((location) => location.id === dto.locationId)
      : undefined;
    const fulfillmentReadyAt = fulfillmentLocation ? nextStoreLocationOpenAt(fulfillmentLocation) : null;
    if (!isContactMessage && locations.length && !fulfillmentLocation) throw new BadRequestException("Elige una ubicación para tu pedido");
    if (fulfillmentLocation && dto.fulfillmentMethod === "pickup" && !fulfillmentLocation.pickupEnabled) throw new BadRequestException("Esta ubicación no ofrece retiro");
    if (fulfillmentLocation && dto.fulfillmentMethod === "delivery" && !fulfillmentLocation.deliveryEnabled) throw new BadRequestException("Esta ubicación no ofrece entrega");
    if (fulfillmentLocation && !dto.fulfillmentMethod) throw new BadRequestException("Elige retiro o entrega");
    if (customerPhone) {
      const digitCount = customerPhone.replace(/\D/g, "").length;
      if (digitCount < 7 || digitCount > 15) throw new BadRequestException("Escribe un número de WhatsApp válido");
    }

    const requestedIds = [...new Set(dto.items.map((item) => item.paymentLinkId))];
    const [merchant, links] = await Promise.all([
      this.prisma.merchant.findUniqueOrThrow({ where: { id: store.merchantId } }),
      this.prisma.paymentLink.findMany({
        where: { id: { in: requestedIds }, storeId: store.id, status: PaymentLinkStatus.ACTIVE },
      }),
    ]);
    if (links.length !== requestedIds.length) {
      throw new BadRequestException("Uno o más productos seleccionados ya no están disponibles");
    }

    const byId = new Map(links.map((link) => [link.id, link]));
    const requestedByProduct = new Map<string, number>();
    const requestedByOption = new Map<string, { quantity: number; stock: number; name: string }>();
    const requestedByExtraPool = new Map<string, { quantity: number; stock: number; name: string }>();
    const lines = dto.items.map((item) => {
      const link = byId.get(item.paymentLinkId)!;
      const variants = readProductVariants(link.variants);
      const availableExtras = readProductExtras(link.extras);
      let variant: ProductVariant | undefined;
      if (variants.length) {
        if (!item.variantId) throw new BadRequestException(`Elige una opción para "${link.name}"`);
        variant = variants.find((candidate) => candidate.id === item.variantId);
        if (!variant) throw new BadRequestException(`Una opción de "${link.name}" ya no está disponible`);
      } else if (item.variantId) {
        throw new BadRequestException(`"${link.name}" no tiene opciones`);
      }

      const extras = resolveSelectedExtras(link.name, availableExtras, item.extraIds);
      const selectedExtraIds = extras.map((extra) => extra.id);

      requestedByProduct.set(link.id, (requestedByProduct.get(link.id) ?? 0) + item.quantity);
      if (variant && typeof variant.stock === "number") {
        const key = `${link.id}:${variant.id}`;
        const current = requestedByOption.get(key);
        requestedByOption.set(key, {
          quantity: (current?.quantity ?? 0) + item.quantity,
          stock: variant.stock,
          name: `${link.name} (${variant.name})`,
        });
      }
      for (const extra of extras) {
        if (extra.stock === 0) throw new BadRequestException(`"${extra.name}" está agotado`);
        if (!extra.inventoryKey || extra.stock === undefined) continue;
        const current = requestedByExtraPool.get(extra.inventoryKey);
        requestedByExtraPool.set(extra.inventoryKey, {
          quantity: (current?.quantity ?? 0) + item.quantity,
          stock: Math.min(current?.stock ?? extra.stock, extra.stock),
          name: extra.inventoryName || extra.name,
        });
      }

      const unitAmount = discountedProductAmount(link, variant?.amount ?? link.amount) + selectedExtrasAmount(extras);
      const details = [variant?.name, selectedExtrasLabel(extras, " · ")].filter(Boolean).join(" · ");
      return {
        paymentLinkId: link.id,
        name: link.name,
        ...(variant && { variantId: variant.id, variantName: variant.name }),
        ...(selectedExtraIds.length && { extraIds: selectedExtraIds, extras: extras.map((extra) => ({ id: extra.id, name: extra.name, amount: extra.amount })) }),
        quantity: item.quantity,
        unitAmount,
        label: `${link.name}${details ? ` (${details})` : ""} × ${item.quantity}`,
        amount: unitAmount * item.quantity,
        currency: link.currency,
      };
    });
    const { picked, linked } = await this.pickedProductStock(store.id, links, dto.items);
    for (const link of [...links, ...linked]) {
      const requested = (requestedByProduct.get(link.id) ?? 0) + (picked.get(link.id) ?? 0);
      if (fulfillmentLocation && requestedByProduct.has(link.id)) {
        const branchStock = readLocationStocks(link.locationStocks)[fulfillmentLocation.id] ?? 0;
        if (branchStock !== null && requested > branchStock) {
          throw new BadRequestException(`La ubicación ${fulfillmentLocation.name} no tiene suficiente stock de "${link.name}"`);
        }
      }
      if (link.stock !== null && requested > link.stock) {
        throw new BadRequestException(`Solo quedan ${link.stock} unidades de "${link.name}"`);
      }
    }
    for (const item of [...requestedByOption.values(), ...requestedByExtraPool.values()]) {
      if (item.quantity > item.stock) throw new BadRequestException(`Solo quedan ${item.stock} unidades de "${item.name}"`);
    }
    const grandTotal = lines.reduce((sum, line) => sum + line.amount, 0);
    if (!isContactMessage && store.checkoutMode !== "external" && (store.checkoutMode !== "payment" || grandTotal > 0)) {
      throw new BadRequestException("Esta tienda solo recibe formularios para pedidos con total cero");
    }
    const currencies = [...new Set(lines.map((line) => line.currency))];
    const totals = currencies.map((currency) => {
      const amount = lines.filter((line) => line.currency === currency).reduce((sum, line) => sum + line.amount, 0);
      return `${(amount / 100).toFixed(2)} ${currency}`;
    });
    const recipient = isContactMessage
      ? store.contactFormEmail || store.contactEmail || merchant.email
      : store.contactEmail || merchant.email;
    const body = isContactMessage
      ? [
          `Nuevo mensaje desde ${store.name}`,
          "",
          `Nombre: ${customerName}`,
          `Correo para responder: ${customerEmail}`,
          ...(customerPhone ? [`WhatsApp: ${customerPhone}`] : []),
          `Mensaje: ${dto.message?.trim() || "Sin mensaje"}`,
          "",
          "Este mensaje fue enviado desde el formulario de contacto de pagosYa.",
        ].join("\n")
      : [
          `Nuevo interesado desde ${store.name}`,
          "",
          `Correo: ${customerEmail}`,
          ...(dto.name?.trim() ? [`Nombre: ${customerName}`] : []),
          ...(customerPhone ? [`WhatsApp: ${customerPhone}`] : []),
          ...(fulfillmentLocation ? [`Ubicación: ${fulfillmentLocation.name}`, `Modalidad: ${dto.fulfillmentMethod === "delivery" ? "Entrega" : "Retiro"}`] : []),
          ...(fulfillmentReadyAt ? [`Disponible desde: ${fulfillmentReadyAt.toLocaleString("es-BO", { timeZone: "America/La_Paz" })}`] : []),
          ...(dto.message?.trim() ? [`Mensaje: ${dto.message.trim()}`] : []),
          "",
          "Productos seleccionados:",
          ...lines.map((line) => `- ${line.label}`),
          `Total de referencia: ${totals.join(" + ")}`,
          "",
          "Este mensaje fue enviado por pagosYa. Responde al correo indicado por el cliente.",
        ].join("\n");

    const lead = await this.prisma.storeLead.create({
      data: {
        merchantId: store.merchantId,
        storeId: store.id,
        customerName,
        customerEmail,
        customerPhone,
        message: dto.message?.trim() || null,
        items: lines as Prisma.InputJsonValue,
        amount: grandTotal,
        currency: currencies[0] || "BOB",
      },
      select: { id: true },
    });
    await this.emailProvider?.send({
      to: recipient,
      subject: isContactMessage
        ? `Nuevo mensaje para ${store.name}: ${customerName}`
        : `Nuevo interesado en ${store.name}: ${dto.name?.trim() || customerEmail}`,
      body,
      replyTo: customerEmail,
      failLoudly: true,
    }).catch(() => this.logger.warn("Lead saved; email notification failed"));
    await this.inbox?.threadForLead({ ...lead, storeId: store.id, merchantId: store.merchantId, customerEmail, customerName, message: dto.message ?? null }).catch(() => undefined);
    return { submitted: true, leadId: lead.id };
  }}
