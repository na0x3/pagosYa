import { AcceptanceContext, truncateUserAgent } from "./terms-acceptance.service";

export type RequestWithContext = {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
};

/** `req.ip` already honours the TRUST_PROXY hop count configured in main.ts. */
export function requestContext(req: RequestWithContext): AcceptanceContext {
  const agent = req.headers["user-agent"];
  return { ipAddress: req.ip ?? null, userAgent: truncateUserAgent(Array.isArray(agent) ? agent[0] : agent) };
}
