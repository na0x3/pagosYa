import { VisualStudioService } from "./visual-studio.service";
import { VisualAiService } from "./visual-ai.service";
import { VisualProposalsService } from "./visual-proposals.service";
import { VisualRevisionService } from "./visual-revision.service";

type Methods<T> = { [K in keyof T]: T[K] };
export type VisualStudioServices = Methods<VisualStudioService> & Methods<VisualAiService> & Methods<VisualProposalsService> & Methods<VisualRevisionService>;

/**
 * Test helper: the visual editor services wired to the same fakes, exposed as one
 * object (spies set on it land on the owning service). Arguments follow the order VisualStudioService's constructor used before
 * it was split.
 */
export function makeVisualStudioServices(prisma: any, uploads: any, config: any, paymentLinks: any, brands?: any, metering?: any): VisualStudioServices {
  const ai = new VisualAiService(prisma, uploads, config, brands, metering);
  const services = [new VisualStudioService(prisma), ai, new VisualProposalsService(prisma, uploads, config, ai, brands), new VisualRevisionService(prisma, uploads, config, paymentLinks, ai, brands)];
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
