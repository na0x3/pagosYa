/** A failed read of the standard kit must not stick: the next receipt tries again. */
describe('loadFloorKit after a failed read', () => {
  afterEach(() => { jest.resetModules(); jest.dontMock('node:fs/promises'); });

  it('reads again on the next call instead of caching the failure', async () => {
    const real = jest.requireActual('node:fs/promises');
    let calls = 0;
    jest.doMock('node:fs/promises', () => ({ ...real, readFile: jest.fn((...args: unknown[]) => (++calls === 1 ? Promise.reject(new Error('EMFILE')) : real.readFile(...args))) }));
    const { loadFloorKit } = await import('./email-copy-defaults');
    await expect(loadFloorKit()).rejects.toThrow('EMFILE');
    await expect(loadFloorKit()).resolves.toMatchObject({ layout: expect.stringContaining('data-email-content') });
  });
});
