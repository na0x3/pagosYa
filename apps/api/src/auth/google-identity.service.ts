import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";

export interface VerifiedGoogleIdentity {
  subject: string;
  email: string;
  name: string;
  emailAuthoritative: boolean;
}

@Injectable()
export class GoogleIdentityService {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService) {}

  clientConfig() {
    const clientId = this.clientId();
    return { enabled: Boolean(clientId), clientId: clientId || null };
  }

  async verifyCredential(credential: string): Promise<VerifiedGoogleIdentity> {
    const clientId = this.clientId();
    if (!clientId) throw new ServiceUnavailableException("El acceso con Google todavía no está configurado");

    try {
      const ticket = await this.client.verifyIdToken({ idToken: credential, audience: clientId });
      const payload = ticket.getPayload();
      const email = payload?.email?.trim().toLowerCase();
      if (!payload?.sub || !email || payload.email_verified !== true) {
        throw new UnauthorizedException("Google no pudo confirmar esta cuenta");
      }
      return {
        subject: payload.sub,
        email,
        name: payload.name?.trim() || email.split("@")[0],
        emailAuthoritative: email.endsWith("@gmail.com") || Boolean(payload.hd),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("La credencial de Google no es válida o venció");
    }
  }

  private clientId(): string {
    return this.config.get<string>("app.google.clientId")?.trim() ?? "";
  }
}
