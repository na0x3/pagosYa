import { ConfigService } from "@nestjs/config";
import { MockAccessControlProvider, ZKTecoSpeedFaceProvider, type AccessControlProvider, type ZKTecoIntegrationMode } from "@pagosya/access-control";

export const ACCESS_CONTROL_PROVIDER = Symbol("ACCESS_CONTROL_PROVIDER");

export function createAccessControlProvider(config: ConfigService, mock: MockAccessControlProvider): AccessControlProvider {
  const mode = (config.get<string>("ZKTECO_INTEGRATION_MODE") || process.env.ZKTECO_INTEGRATION_MODE || "mock").toLowerCase();
  if (mode === "mock") return mock;
  if (mode !== "push" && mode !== "sdk") throw new Error("ZKTECO_INTEGRATION_MODE must be mock, push, or sdk");
  const configuredPort = config.get<string>("ZKTECO_DEVICE_PORT") || process.env.ZKTECO_DEVICE_PORT;
  return new ZKTecoSpeedFaceProvider({
    mode: mode as ZKTecoIntegrationMode,
    host: config.get<string>("ZKTECO_DEVICE_HOST") || process.env.ZKTECO_DEVICE_HOST,
    port: configuredPort ? Number(configuredPort) : undefined,
    username: config.get<string>("ZKTECO_USERNAME") || process.env.ZKTECO_USERNAME,
    password: config.get<string>("ZKTECO_PASSWORD") || process.env.ZKTECO_PASSWORD,
  });
}
