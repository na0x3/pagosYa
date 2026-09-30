import { OperationsWorker } from "./operations.worker";

function setup(overrides: { generate?: jest.Mock; automations?: jest.Mock } = {}) {
  const prisma: any = { store: { findMany: jest.fn().mockResolvedValue([{ id: "s1", merchantId: "m1" }, { id: "s2", merchantId: "m2" }]) } };
  const operations: any = { runAutomations: overrides.automations ?? jest.fn().mockResolvedValue(undefined) };
  const appointments: any = { releaseExpiredAppointmentHolds: jest.fn().mockResolvedValue(undefined) };
  const subscriptions: any = {
    generateSubscriptionInvoices: overrides.generate ?? jest.fn().mockResolvedValue({}),
    sendDueSubscriptionReminders: jest.fn().mockResolvedValue({}),
    expireMissedRenewals: jest.fn().mockResolvedValue({}),
  };
  const worker = new OperationsWorker(prisma, operations, appointments, subscriptions);
  const error = jest.spyOn((worker as any).logger, "warn").mockImplementation(() => undefined);
  return { worker, subscriptions, error };
}

describe("OperationsWorker subscription engine", () => {
  it("still sends reminders and expires misses when generation rejects, and keeps going to the next store", async () => {
    const generate = jest.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue({});
    const { worker, subscriptions, error } = setup({ generate });
    await worker.maintain();
    expect(subscriptions.sendDueSubscriptionReminders).toHaveBeenCalledTimes(2);
    expect(subscriptions.expireMissedRenewals).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });

  it("does the same when the store's automations reject", async () => {
    const { worker, subscriptions } = setup({ automations: jest.fn().mockRejectedValue(new Error("auto")) });
    await worker.maintain();
    expect(subscriptions.generateSubscriptionInvoices).toHaveBeenCalledTimes(2);
    expect(subscriptions.expireMissedRenewals).toHaveBeenCalledTimes(2);
  });
});
