import { BadRequestException } from "@nestjs/common";
import { isPublicNetworkAddress, validateWebhookUrl } from "./webhook-http.client";

describe("webhook outbound network policy", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.4.2",
    "192.168.1.2",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("blocks private, local, metadata, or reserved address %s", (address) => {
    expect(isPublicNetworkAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows public address %s", (address) => {
    expect(isPublicNetworkAddress(address)).toBe(true);
  });

  it.each([
    "http://merchant.example/webhook",
    "https://user:password@merchant.example/webhook",
    "https://localhost/webhook",
    "https://127.0.0.1/webhook",
    "https://169.254.169.254/latest/meta-data",
    "file:///etc/passwd",
  ])("rejects unsafe webhook URL %s", async (url) => {
    await expect(validateWebhookUrl(url)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("accepts a canonical public HTTPS IP without performing mutable DNS resolution", async () => {
    await expect(validateWebhookUrl("https://8.8.8.8/webhook?source=pagosya")).resolves.toBe(
      "https://8.8.8.8/webhook?source=pagosya",
    );
  });
});
