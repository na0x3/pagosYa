import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SecretApiKeyGuard } from "../auth/guards/secret-api-key.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { MerchantSessionGuard } from "./guards/merchant-session.guard";
import { MerchantUserService } from "./merchant-user.service";
import { MerchantSessionService } from "./merchant-session.service";
import { DashboardSignupDto } from "./dto/dashboard-signup.dto";
import { DashboardLoginDto } from "./dto/dashboard-login.dto";

@ApiTags("dashboard")
@Controller("v1/dashboard")
export class DashboardController {
  constructor(
    private readonly merchantUsers: MerchantUserService,
    private readonly sessions: MerchantSessionService,
  ) {}

  /** Called once from the merchant's own backend (with their secret key) to provision a human login — never from the browser. */
  @Post("signup")
  @ApiBearerAuth()
  @UseGuards(SecretApiKeyGuard)
  signup(@CurrentMerchant() merchant: { id: string }, @Body() dto: DashboardSignupDto) {
    return this.merchantUsers.signup(merchant.id, dto.email, dto.password);
  }

  /** The only dashboard endpoint the browser calls without already having a credential. */
  @Post("login")
  login(@Body() dto: DashboardLoginDto) {
    return this.sessions.login(dto.email, dto.password);
  }

  @Post("logout")
  @ApiBearerAuth()
  @UseGuards(MerchantSessionGuard)
  async logout(@Req() req: { sessionToken: string }) {
    await this.sessions.revoke(req.sessionToken);
    return { success: true };
  }
}
