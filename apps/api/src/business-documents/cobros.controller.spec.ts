import { CobrosController } from "./cobros.controller";
import { CobrosWorker } from "./cobros.worker";

describe("cobros routes", () => {
  const merchant = { id: "m_1" };

  it("hands Recordar, Compartir and the customer picker to the service with the merchant", async () => {
    const cobros = {
      remind: jest.fn().mockResolvedValue({ emailed: true }),
      shared: jest.fn().mockResolvedValue({ shared: true }),
      customerSuggestions: jest.fn().mockResolvedValue([]),
      markPaid: jest.fn().mockResolvedValue({ status: "PAID" }),
      setAutoReminders: jest.fn().mockResolvedValue({ autoReminders: false }),
    };
    const controller = new CobrosController(cobros as any);
    await controller.markPaid(merchant, "store_1", "cdoc1", { method: "cash", reference: "Recibo 12" });
    await controller.reminders(merchant, "store_1", "cdoc1", { autoReminders: false });
    expect(cobros.markPaid).toHaveBeenCalledWith("m_1", "store_1", "cdoc1", { method: "cash", reference: "Recibo 12" });
    expect(cobros.setAutoReminders).toHaveBeenCalledWith("m_1", "store_1", "cdoc1", { autoReminders: false });
    await controller.remind(merchant, "store_1", "cdoc1", { channel: "email" });
    await controller.shared(merchant, "store_1", "cdoc1", { channel: "whatsapp" });
    await controller.customers(merchant, "store_1", { q: "ana" });
    expect(cobros.remind).toHaveBeenCalledWith("m_1", "store_1", "cdoc1", { channel: "email" });
    expect(cobros.shared).toHaveBeenCalledWith("m_1", "store_1", "cdoc1", { channel: "whatsapp" });
    expect(cobros.customerSuggestions).toHaveBeenCalledWith("m_1", "store_1", "ana");
  });
});

describe("cobros worker", () => {
  it("runs the maintenance and never lets a failure escape the interval", async () => {
    const cobros = { runMaintenance: jest.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue({ overdue: 1, reminders: 0 }) };
    const worker = new CobrosWorker(cobros as any);
    await expect(worker.tick()).resolves.toBeUndefined();
    await expect(worker.tick()).resolves.toBeUndefined();
    expect(cobros.runMaintenance).toHaveBeenCalledTimes(2);
  });

  it("does not overlap a slow run with the next tick", async () => {
    let release!: () => void;
    const cobros = { runMaintenance: jest.fn(() => new Promise<{ overdue: number; reminders: number }>((resolve) => { release = () => resolve({ overdue: 0, reminders: 0 }); })) };
    const worker = new CobrosWorker(cobros as any);
    const first = worker.tick();
    await worker.tick();
    expect(cobros.runMaintenance).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
});
