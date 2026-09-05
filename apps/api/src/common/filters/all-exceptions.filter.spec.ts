import { ArgumentsHost, BadRequestException, Logger, ServiceUnavailableException } from "@nestjs/common";
import { PaymentIntentStatus } from "@prisma/client";
import {
  IllegalStateTransitionError,
  PaymentIntentEvent,
} from "../../payment-intents/payment-intent.state-machine";
import { AllExceptionsFilter } from "./all-exceptions.filter";

function makeHost(request: { method: string; url: string }) {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe("AllExceptionsFilter", () => {
  it("preserves status/body for a known HttpException and does not log it (4xx, expected)", () => {
    const filter = new AllExceptionsFilter();
    const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { host, response } = makeHost({ method: "POST", url: "/v1/merchants/kyc" });

    filter.catch(new BadRequestException("Merchant is already active"), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: "Merchant is already active" }),
    );
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("logs and returns a generic 500 for an unexpected thrown Error", () => {
    const filter = new AllExceptionsFilter();
    const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { host, response } = makeHost({ method: "GET", url: "/v1/merchants/balance" });

    filter.catch(new Error("prisma connection reset"), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ statusCode: 500, message: "Internal server error" });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("prisma connection reset"),
      expect.any(String),
    );
    errorSpy.mockRestore();
  });

  it("returns a controlled conflict when a concurrent request wins a PaymentIntent transition", () => {
    const filter = new AllExceptionsFilter();
    const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { host, response } = makeHost({ method: "POST", url: "/v1/payment_intents/pi_123/confirm" });

    filter.catch(
      new IllegalStateTransitionError(PaymentIntentStatus.PROCESSING, PaymentIntentEvent.CONFIRM),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 409,
      message: "PaymentIntent state changed; refresh and retry",
    });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("logs a 5xx HttpException too, not just raw Errors", () => {
    const filter = new AllExceptionsFilter();
    const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { host } = makeHost({ method: "POST", url: "/v1/payouts" });

    filter.catch(new ServiceUnavailableException("Database unavailable"), host);

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("never writes URL query credentials or bearer-shaped secrets to logs", () => {
    const filter = new AllExceptionsFilter();
    const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const secret = "pi_abc_secret_SuperSecretValue";
    const { host } = makeHost({ method: "GET", url: `/v1/checkout/session?client_secret=${secret}` });

    filter.catch(new Error(`upstream failed for ${secret}`), host);

    const logged = errorSpy.mock.calls.flat().join(" ");
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain("client_secret=");
    expect(logged).toContain("/v1/checkout/session");
    errorSpy.mockRestore();
  });
});
