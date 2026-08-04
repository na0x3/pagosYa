import { Inject, Injectable } from "@nestjs/common";
import { PaymentMethodType } from "@prisma/client";
import type { RailId } from "@pagosya/shared-types";
import { PaymentRailAdapter } from "./interfaces/payment-rail-adapter.interface";
import { RAIL_ADAPTERS } from "./tokens";
import { UnknownRailError, UnsupportedPaymentMethodError } from "./rail-registry.errors";

/**
 * Single point of rail pluggability: PaymentIntentsService only ever talks to
 * this registry. Swapping a mock adapter for a real bank/Tigo Money/acquirer
 * integration means adding one class + one line in RailsModule's providers —
 * this file and its callers never change.
 */
@Injectable()
export class RailRegistry {
  private readonly byId = new Map<RailId, PaymentRailAdapter>();

  constructor(@Inject(RAIL_ADAPTERS) adapters: PaymentRailAdapter[]) {
    adapters.forEach((adapter) => this.byId.set(adapter.railId, adapter));
  }

  getForMethodType(type: PaymentMethodType): PaymentRailAdapter {
    const adapter = [...this.byId.values()].find((a) => a.supportedMethodTypes.includes(type));
    if (!adapter) throw new UnsupportedPaymentMethodError(type);
    return adapter;
  }

  get(railId: RailId): PaymentRailAdapter {
    const adapter = this.byId.get(railId);
    if (!adapter) throw new UnknownRailError(railId);
    return adapter;
  }
}
