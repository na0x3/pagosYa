import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ConsumerUser } from "@prisma/client";
import { ConsumerService } from "./consumer.service";
import { ConsumerSessionService } from "./consumer-session.service";
import { ConsumerAuthGuard } from "./consumer-auth.guard";
import { CurrentConsumer } from "./current-consumer.decorator";
import { ConsumerSignupDto } from "./dto/consumer-signup.dto";
import { ConsumerLoginDto } from "./dto/consumer-login.dto";
import { ConsumerObligationCheckoutDto } from "./dto/consumer-obligation-checkout.dto";
import { GoogleLoginDto } from "../auth/dto/google-login.dto";
import { DeleteAccountDto } from "../auth/dto/delete-account.dto";

@ApiTags("consumer")
@Controller("v1/consumer")
export class ConsumerController {
  constructor(
    private readonly consumers: ConsumerService,
    private readonly sessions: ConsumerSessionService,
  ) {}

  @Post("signup")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  signup(@Body() dto: ConsumerSignupDto) {
    return this.consumers.signup(dto.name, dto.email, dto.carnet, dto.password);
  }

  @Get("verify_email")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyEmail(@Query("token") token: string) {
    if (!token) throw new BadRequestException("Falta el token");
    return this.consumers.verifyEmail(token);
  }

  @Post("login")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() dto: ConsumerLoginDto) {
    return this.sessions.login(dto.email, dto.password);
  }

  @Post("google")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  googleLogin(@Body() dto: GoogleLoginDto) {
    return this.sessions.loginWithGoogle(dto.credential, dto.carnet);
  }

  @Post("logout")
  @ApiBearerAuth()
  @UseGuards(ConsumerAuthGuard)
  async logout(@Req() req: { consumerSessionToken: string }) {
    await this.sessions.revoke(req.consumerSessionToken);
    return { success: true };
  }

  @Delete("account")
  @ApiBearerAuth()
  @UseGuards(ConsumerAuthGuard)
  deleteAccount(@CurrentConsumer() user: ConsumerUser, @Body() _dto: DeleteAccountDto) {
    return this.sessions.deactivateAccount(user.id);
  }

  @Get("dashboard")
  @ApiBearerAuth()
  @UseGuards(ConsumerAuthGuard)
  dashboard(@CurrentConsumer() user: ConsumerUser) {
    return this.consumers.dashboard(user.id);
  }

  @Post("orders/claim/:token")
  @ApiBearerAuth()
  @UseGuards(ConsumerAuthGuard)
  claimOrder(@CurrentConsumer() user: ConsumerUser, @Param("token") token: string) {
    return this.consumers.claimTrackedOrder(user.id, token);
  }

  @Get("affiliation_offers")
  @ApiBearerAuth()
  @UseGuards(ConsumerAuthGuard)
  offers(@CurrentConsumer() user: ConsumerUser) {
    return this.consumers.affiliationOffers(user.id);
  }

  @Post("affiliations/:storeId/accept")
  @ApiBearerAuth()
  @UseGuards(ConsumerAuthGuard)
  accept(@CurrentConsumer() user: ConsumerUser, @Param("storeId") storeId: string) {
    return this.consumers.acceptAffiliation(user.id, storeId);
  }

  @Get("affiliations/:id/obligations")
  @ApiBearerAuth()
  @UseGuards(ConsumerAuthGuard)
  obligations(@CurrentConsumer() user: ConsumerUser, @Param("id") id: string) {
    return this.consumers.obligations(user.id, id);
  }

  @Post("affiliations/:id/checkout")
  @ApiBearerAuth()
  @UseGuards(ConsumerAuthGuard)
  checkout(
    @CurrentConsumer() user: ConsumerUser,
    @Param("id") id: string,
    @Body() dto: ConsumerObligationCheckoutDto,
  ) {
    return this.consumers.checkoutObligations(user.id, id, dto.debtRecordIds);
  }

  @Delete("affiliations/:id")
  @ApiBearerAuth()
  @UseGuards(ConsumerAuthGuard)
  revoke(@CurrentConsumer() user: ConsumerUser, @Param("id") id: string) {
    return this.consumers.revokeAffiliation(user.id, id);
  }
}
