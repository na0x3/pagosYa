import { StoreImportWorker } from './store-import.worker';

// Final review, Important #9: a multi-minute YAPI build must not hold back a merchant's import.
describe('StoreImportWorker', () => {
  it('runs imports while a design build is still in progress', async () => {
    let finishDesign!: () => void;
    const imports: any = {
      claim: jest.fn(async () => ({ id: 'import' })), run: jest.fn(async () => {}),
      claimDesign: jest.fn(async () => ({ id: 'design' })), runDesign: jest.fn(() => new Promise<void>(resolve => { finishDesign = resolve; })),
    };
    const worker = new StoreImportWorker(imports);
    const design = worker.designs();
    await new Promise(resolve => setImmediate(resolve));
    await worker.imports();
    expect(imports.run).toHaveBeenCalledWith({ id: 'import' });
    finishDesign(); await design;
  });
});
