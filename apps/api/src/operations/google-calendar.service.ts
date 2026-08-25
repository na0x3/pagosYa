import { BadGatewayException, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { OAuth2Client } from "google-auth-library";
import { PrismaService } from "../prisma/prisma.service";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

type CalendarAppointment = {
  id: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
  status?: string;
};

@Injectable()
export class GoogleCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private oauthClient(): OAuth2Client {
    const clientId = this.config.get<string>("app.google.clientId") ?? "";
    const clientSecret = this.config.get<string>("app.google.clientSecret") ?? "";
    const redirectUri = this.config.get<string>("app.google.calendarRedirectUri") ?? "";
    if (!clientId || !clientSecret || !redirectUri) {
      throw new ServiceUnavailableException("Google Calendar no está configurado en el servidor");
    }
    return new OAuth2Client(clientId, clientSecret, redirectUri);
  }

  private encryptionKey(): Buffer {
    const configured = this.config.get<string>("app.operationsEncryptionKey") ?? "";
    if (!configured) throw new ServiceUnavailableException("Falta OPERATIONS_ENCRYPTION_KEY para proteger Calendar");
    return createHash("sha256").update(configured, "utf8").digest();
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
  }

  private decrypt(value: string): string {
    const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
    if (!ivRaw || !tagRaw || !encryptedRaw) throw new UnauthorizedException("La credencial de Calendar no es válida");
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey(), Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }

  async authorizationUrl(merchantId: string, storeId: string) {
    await this.prisma.store.findFirstOrThrow({ where: { id: storeId, merchantId }, select: { id: true } });
    const state = randomBytes(32).toString("base64url");
    const stateHash = createHash("sha256").update(state).digest("hex");
    await this.prisma.calendarOauthState.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await this.prisma.calendarOauthState.create({
      data: { stateHash, merchantId, storeId, expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS) },
    });
    return {
      url: this.oauthClient().generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: true,
        scope: CALENDAR_SCOPES,
        state,
      }),
    };
  }

  async completeAuthorization(state: string, code: string) {
    const stateHash = createHash("sha256").update(state).digest("hex");
    const saved = await this.prisma.calendarOauthState.findUnique({ where: { stateHash } });
    if (!saved || saved.expiresAt <= new Date()) throw new UnauthorizedException("La conexión con Calendar venció; inicia de nuevo");
    await this.prisma.calendarOauthState.delete({ where: { id: saved.id } });

    const client = this.oauthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      throw new BadGatewayException("Google no devolvió acceso sin conexión; revoca el permiso e inténtalo nuevamente");
    }
    client.setCredentials(tokens);
    const accessToken = (await client.getAccessToken()).token;
    if (!accessToken) throw new BadGatewayException("Google no devolvió un token de acceso");

    const [profileResponse, calendarsResponse] = await Promise.all([
      fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { authorization: `Bearer ${accessToken}` } }),
      fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer", { headers: { authorization: `Bearer ${accessToken}` } }),
    ]);
    const profile = profileResponse.ok ? await profileResponse.json() as { email?: string } : {};
    const calendars = calendarsResponse.ok
      ? await calendarsResponse.json() as { items?: Array<{ id?: string; primary?: boolean }> }
      : {};
    const calendarId = calendars.items?.find((item) => item.primary)?.id ?? calendars.items?.[0]?.id ?? "primary";

    const connection = await this.prisma.calendarConnection.upsert({
      where: { storeId: saved.storeId },
      create: {
        merchantId: saved.merchantId,
        storeId: saved.storeId,
        accountEmail: profile.email,
        calendarId,
        refreshTokenCiphertext: this.encrypt(tokens.refresh_token),
      },
      update: {
        accountEmail: profile.email,
        calendarId,
        refreshTokenCiphertext: this.encrypt(tokens.refresh_token),
        status: "ACTIVE",
      },
      select: { id: true, storeId: true, accountEmail: true, calendarId: true, status: true },
    });
    return connection;
  }

  async accessTokenForStore(storeId: string): Promise<{ token: string; calendarId: string } | null> {
    const connection = await this.prisma.calendarConnection.findUnique({ where: { storeId } });
    if (!connection || connection.status !== "ACTIVE") return null;
    const client = this.oauthClient();
    client.setCredentials({ refresh_token: this.decrypt(connection.refreshTokenCiphertext) });
    const token = (await client.getAccessToken()).token;
    if (!token) throw new BadGatewayException("No se pudo renovar el acceso a Google Calendar");
    return { token, calendarId: connection.calendarId };
  }

  private eventPayload(storeId: string, storeName: string, serviceName: string, appointment: CalendarAppointment) {
    return {
      summary: `${serviceName} · ${appointment.customerName}`,
      description: [
        `Reserva creada desde pagosYa para ${storeName}.`,
        appointment.customerPhone ? `Teléfono: ${appointment.customerPhone}` : "",
        appointment.notes ?? "",
        `Referencia pagosYa: ${appointment.id}`,
      ].filter(Boolean).join("\n"),
      start: { dateTime: appointment.startsAt.toISOString(), timeZone: "America/La_Paz" },
      end: { dateTime: appointment.endsAt.toISOString(), timeZone: "America/La_Paz" },
      attendees: appointment.customerEmail ? [{ email: appointment.customerEmail }] : undefined,
      extendedProperties: { private: { pagosYaAppointmentId: appointment.id, pagosYaStoreId: storeId } },
    };
  }

  async createEvent(storeId: string, storeName: string, serviceName: string, appointment: CalendarAppointment) {
    const access = await this.accessTokenForStore(storeId);
    if (!access) return null;
    const sendUpdates = appointment.status === "PENDING" ? "none" : "all";
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(access.calendarId)}/events?sendUpdates=${sendUpdates}`, {
      method: "POST",
      headers: { authorization: `Bearer ${access.token}`, "content-type": "application/json" },
      body: JSON.stringify(this.eventPayload(storeId, storeName, serviceName, appointment)),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; error?: { message?: string } };
    if (!response.ok || !body.id) throw new BadGatewayException(body.error?.message ?? "Google Calendar rechazó la cita");
    return body.id;
  }

  async updateEvent(storeId: string, eventId: string, storeName: string, serviceName: string, appointment: CalendarAppointment) {
    const access = await this.accessTokenForStore(storeId);
    if (!access) return false;
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(access.calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${access.token}`, "content-type": "application/json" },
      body: JSON.stringify(this.eventPayload(storeId, storeName, serviceName, appointment)),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new BadGatewayException(body.error?.message ?? "Google Calendar rechazó el cambio de la cita");
    }
    return true;
  }

  async deleteEvent(storeId: string, eventId: string) {
    const access = await this.accessTokenForStore(storeId);
    if (!access) return false;
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(access.calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${access.token}` },
    });
    if (!response.ok && ![404, 410].includes(response.status)) {
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new BadGatewayException(body.error?.message ?? "Google Calendar rechazó la cancelación de la cita");
    }
    return true;
  }

  async freeBusy(merchantId: string, storeId: string, timeMin: Date, timeMax: Date) {
    await this.prisma.store.findFirstOrThrow({ where: { id: storeId, merchantId }, select: { id: true } });
    const access = await this.accessTokenForStore(storeId);
    if (!access) return { connected: false, busy: [] };
    const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { authorization: `Bearer ${access.token}`, "content-type": "application/json" },
      body: JSON.stringify({ timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), timeZone: "America/La_Paz", items: [{ id: access.calendarId }] }),
    });
    const body = await response.json().catch(() => ({})) as { calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>; error?: { message?: string } };
    if (!response.ok) throw new BadGatewayException(body.error?.message ?? "No se pudo consultar disponibilidad en Calendar");
    return { connected: true, busy: body.calendars?.[access.calendarId]?.busy ?? [] };
  }
}
