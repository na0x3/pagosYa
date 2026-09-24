import { StoresService } from "./stores.service";
import { PublicStoresService } from "./public-stores.service";
import { StoreCheckoutService } from "./store-checkout.service";

type Methods<T> = { [K in keyof T]: T[K] };
export type StoreServices = Methods<StoresService> & Methods<PublicStoresService> & Methods<StoreCheckoutService>;

/**
 * Test helper: the three store services wired to the same fakes, exposed as one
 * object (spies set on it land on the owning service) so specs can call any store method. Arguments follow the order the
 * services' constructors used before they were split.
 */
export function makeStoreServices(prisma: any, paymentIntents?: any, uploads?: any, emailProvider?: any, promoCodes?: any, config?: any): StoreServices {
  const services = [new StoresService(prisma, paymentIntents, uploads), new PublicStoresService(prisma), new StoreCheckoutService(prisma, paymentIntents, emailProvider, promoCodes, config)];
  return combineServices(services);
}

/** One object whose properties resolve to whichever service owns them, so spies on it reach that service. */
function combineServices(services: object[]): any {
  const owner = (name: PropertyKey) => services.find((service) => name in service);
  return new Proxy({}, {
    get: (_target, name) => {
      const service: any = owner(name);
      if (!service) return undefined;
      const value = service[name];
      return typeof value === "function" && !Object.prototype.hasOwnProperty.call(service, name) ? value.bind(service) : value;
    },
    set: (_target, name, value) => { const service: any = owner(name); if (!service) return false; service[name] = value; return true; },
    has: (_target, name) => owner(name) !== undefined,
    getOwnPropertyDescriptor: (_target, name) => owner(name) ? { configurable: true, enumerable: true, writable: true, value: (owner(name) as any)[name] } : undefined,
  });
}
