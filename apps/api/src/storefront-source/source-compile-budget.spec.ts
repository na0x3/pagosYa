import { Reflector } from '@nestjs/core';
import { SourceAssetsController } from './source-assets.controller';
import { SourceProjectsController } from './source-projects.controller';
import { CompileBudget, MerchantThrottlerGuard, SUSTAINED_COMPILES_PER_HOUR } from './source-compile-budget';

/** Mirrors THROTTLER_LIMIT, which @nestjs/throttler does not re-export from its index. */
const limitKey = (name: string) => `THROTTLER:LIMIT${name}`;

const guard = () => {
  const instance = new MerchantThrottlerGuard({ throttlers: [] } as any, {} as any, new Reflector());
  return instance as any;
};

const context = (handler: (...args: any[]) => unknown, controller: any = SourceProjectsController) => ({
  getHandler: () => handler,
  getClass: () => controller,
}) as any;

describe('compile budget', () => {
  it('charges the merchant, not the address they happen to be on', async () => {
    const tracker = guard().getTracker.bind(guard());
    expect(await tracker({ merchant: { id: 'm1' }, ip: '1.1.1.1' })).toBe('merchant:m1');
    expect(await tracker({ merchant: { id: 'm1' }, ip: '2.2.2.2' })).toBe('merchant:m1');
    // Two merchants behind one office NAT no longer spend each other's budget.
    expect(await tracker({ merchant: { id: 'm2' }, ip: '1.1.1.1' })).not.toBe('merchant:m1');
    expect(await tracker({ ip: '1.1.1.1' })).toBe('ip:1.1.1.1');
    expect(await tracker({})).toBe('ip:unknown');
  });

  it('pools every recompiling route into one hourly bucket', () => {
    const subject = guard();
    const proto = SourceProjectsController.prototype as any;
    const keyFor = (handler: any) => subject.generateKey(context(handler), 'merchant:m1', 'sustained');
    const budgeted = [proto.save, proto.editFile, proto.setMotion, proto.visualEdit, proto.generate].map(keyFor);
    expect(new Set(budgeted).size).toBe(1);
    expect(subject.generateKey(context(SourceAssetsController.prototype.roles, SourceAssetsController),'merchant:m1','sustained')).toBe(budgeted[0]);
    // A read must never be able to spend what a recompile is allowed.
    expect(keyFor(proto.state)).not.toBe(budgeted[0]);
    expect(subject.generateKey(context(proto.save), 'merchant:m1', 'default')).not.toBe(budgeted[0]);
    expect(budgeted[0]).not.toMatch(/m1/);
  });

  it('separates merchants inside the shared bucket', () => {
    const subject = guard();
    const proto = SourceProjectsController.prototype as any;
    expect(subject.generateKey(context(proto.save), 'merchant:m1', 'sustained'))
      .not.toBe(subject.generateKey(context(proto.save), 'merchant:m2', 'sustained'));
  });

  /**
   * The list is the point: a new route that recompiles has to be added here on
   * purpose, so it cannot quietly arrive outside the budget.
   */
  it('budgets exactly the routes that recompile the project', () => {
    const reflector = new Reflector();
    const proto = SourceProjectsController.prototype as any;
    const budgeted = Object.getOwnPropertyNames(proto)
      .filter(name => name !== 'constructor' && typeof proto[name] === 'function')
      .filter(name => reflector.get<number>(limitKey('sustained'), proto[name]) !== undefined);
    expect(new Set(budgeted)).toEqual(new Set(['save', 'editFile', 'setMotion', 'visualEdit', 'generate', 'addStandardPages', 'contactForm', 'restore']));
    expect(reflector.get<number>(limitKey('sustained'), proto.save)).toBe(SUSTAINED_COMPILES_PER_HOUR);
    // Stacking the two decorators must not cost the route its burst limit.
    expect(reflector.get<number>(limitKey('default'), proto.setMotion)).toBe(12);
    expect(reflector.get<number>(limitKey('default'), proto.visualEdit)).toBe(30);
    expect(reflector.get<number>(limitKey('default'), proto.generate)).toBe(3);
  });

  it('tells the merchant how long to wait, in Spanish, without a diagnostic', async () => {
    const message = await guard().getErrorMessage({} as any, { timeToExpire: 0, timeToBlockExpire: 1800 } as any);
    expect(message).toBe('Hiciste muchos cambios seguidos en el sitio. Tu revisión sigue guardada; vuelve a intentar en 30 minuto(s).');
    expect(await guard().getErrorMessage({} as any, { timeToExpire: 12, timeToBlockExpire: 0 } as any)).toMatch(/en 1 minuto/);
  });

  it('keeps the budget where a person editing by hand will never meet it', () => {
    // ~1s of CPU per recompile, measured on the fixture project.
    expect(SUSTAINED_COMPILES_PER_HOUR).toBeGreaterThanOrEqual(120);
    expect(SUSTAINED_COMPILES_PER_HOUR).toBeLessThanOrEqual(400);
  });

  it('applies to a route through the decorator itself', () => {
    class Probe { @CompileBudget() run() { return null; } }
    expect(new Reflector().get<number>(limitKey('sustained'), Probe.prototype.run)).toBe(SUSTAINED_COMPILES_PER_HOUR);
  });
});
