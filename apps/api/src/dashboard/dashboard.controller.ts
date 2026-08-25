import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SecretApiKeyGuard } from "../auth/guards/secret-api-key.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { MerchantSessionGuard } from "./guards/merchant-session.guard";
import { MerchantUserService } from "./merchant-user.service";
import { MerchantSessionService } from "./merchant-session.service";
import { DashboardSignupDto } from "./dto/dashboard-signup.dto";
import { DashboardSignupPasswordlessDto } from "./dto/dashboard-signup-passwordless.dto";
import { DashboardLoginDto } from "./dto/dashboard-login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { GoogleLoginDto } from "../auth/dto/google-login.dto";
import { DeleteAccountDto } from "../auth/dto/delete-account.dto";
import { UpdateMerchantSessionDto } from "./dto/update-merchant-session.dto";
import { AcknowledgeProgressCelebrationDto, ClaimProgressCelebrationsDto } from "./dto/claim-progress-celebrations.dto";

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
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  signup(@CurrentMerchant() merchant: { id: string }, @Body() dto: DashboardSignupDto) {
    return this.merchantUsers.signup(merchant.id, dto.email, dto.password);
  }

  /** Same as signup, for a caller with no password to hand over yet — see MerchantUserService.signupPasswordless. */
  @Post("signup_passwordless")
  @ApiBearerAuth()
  @UseGuards(SecretApiKeyGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  signupPasswordless(@CurrentMerchant() merchant: { id: string }, @Body() dto: DashboardSignupPasswordlessDto) {
    return this.merchantUsers.signupPasswordless(merchant.id, dto.email);
  }

  /** The only dashboard endpoint the browser calls without already having a credential — classic brute-force target. */
  @Post("login")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() dto: DashboardLoginDto) {
    return this.sessions.login(dto.email, dto.password);
  }

  @Post("google")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  googleLogin(@Body() dto: GoogleLoginDto) {
    return this.sessions.loginWithGoogle(dto.credential);
  }

  /** GET, not POST: this is meant to be clicked directly out of an email client. Throttled against token-guessing. */
  @Get("verify_email")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyEmail(@Query("token") token: string) {
    if (!token) throw new BadRequestException("Missing token");
    return this.merchantUsers.verifyEmail(token);
  }

  @Post("logout")
  @ApiBearerAuth()
  @UseGuards(MerchantSessionGuard)
  async logout(@Req() req: { sessionToken: string }) {
    await this.sessions.revoke(req.sessionToken);
    return { success: true };
  }

  @Get("sessions")
  @ApiBearerAuth()
  @UseGuards(MerchantSessionGuard)
  activeSessions(@Req() req: { merchantUser: { id: string }; sessionToken: string }) {
    return this.sessions.listActiveSessions(req.merchantUser.id, req.sessionToken);
  }

  @Delete("sessions/:sessionId")
  @ApiBearerAuth()
  @UseGuards(MerchantSessionGuard)
  revokeSession(
    @Req() req: { merchantUser: { id: string }; sessionToken: string },
    @Param("sessionId") sessionId: string,
  ) {
    return this.sessions.revokeSessionById(req.merchantUser.id, sessionId, req.sessionToken);
  }

  @Patch("sessions/:sessionId")
  @ApiBearerAuth()
  @UseGuards(MerchantSessionGuard)
  updateSession(
    @Req() req: { merchantUser: { id: string }; sessionToken: string },
    @Param("sessionId") sessionId: string,
    @Body() dto: UpdateMerchantSessionDto,
  ) {
    return this.sessions.updateSessionIdentity(
      req.merchantUser.id,
      sessionId,
      req.sessionToken,
      dto.profileName,
      dto.profileAvatarId,
    );
  }

  @Post("daily-login-reward")
  @ApiBearerAuth()
  @UseGuards(MerchantSessionGuard)
  dailyLoginReward(@Req() req: { merchantUser: { id: string } }) {
    return this.sessions.claimDailyLoginStar(req.merchantUser.id);
  }

  @Post("progress-celebrations")
  @ApiBearerAuth()
  @UseGuards(MerchantSessionGuard)
  progressCelebrations(
    @Req() req: { merchant: { id: string }; merchantUser: { id: string } },
    @Body() dto: ClaimProgressCelebrationsDto,
  ) {
    return this.sessions.pendingProgressCelebrations(req.merchant.id, req.merchantUser.id, dto.storeId);
  }

  @Post("progress-celebrations/acknowledge")
  @ApiBearerAuth()
  @UseGuards(MerchantSessionGuard)
  acknowledgeProgressCelebration(
    @Req() req: { merchant: { id: string }; merchantUser: { id: string } },
    @Body() dto: AcknowledgeProgressCelebrationDto,
  ) {
    return this.sessions.acknowledgeProgressCelebration(req.merchant.id, req.merchantUser.id, dto.storeId, dto.level);
  }

  @Delete("account")
  @ApiBearerAuth()
  @UseGuards(MerchantSessionGuard)
  async deleteAccount(
    @Req() req: { merchant: { id: string }; merchantUser: { id: string } },
    @Body() _dto: DeleteAccountDto,
  ) {
    return this.sessions.deactivateAccount(req.merchant.id, req.merchantUser.id);
  }

  /** Also protects against using this as an email-bombing tool against a victim address. */
  @Post("forgot_password")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.merchantUsers.requestPasswordReset(dto.email);
  }

  @Post("reset_password")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.merchantUsers.resetPassword(dto.token, dto.newPassword);
  }
}
