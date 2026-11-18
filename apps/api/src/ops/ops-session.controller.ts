import { Body, Controller, Delete, HttpCode, Post, Req } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { assertOpsNetwork } from "./guards/ops-auth.guard";
import { OpsUserService } from "./ops-user.service";
import { ConfirmOpsMfaDto, OpsTokenDto, StartOpsSessionDto } from "./dto/ops-session.dto";

/** Staff sign-in with a second factor (ISO A-01): the ops_ token and an authenticator code start a 10 h session. */
@ApiTags("ops")
@Controller("internal/ops_session")
export class OpsSessionController {
  constructor(
    private readonly opsUsers: OpsUserService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  start(@Body() dto: StartOpsSessionDto, @Req() req: { ip?: string }) {
    assertOpsNetwork(this.config, req.ip);
    return this.opsUsers.startSession(dto.token, dto.code, req.ip);
  }

  @Delete()
  @HttpCode(204)
  @ApiBearerAuth()
  async end(@Req() req: { headers: Record<string, string | string[] | undefined> }) {
    const header = req.headers["authorization"];
    const value = Array.isArray(header) ? header[0] : header;
    await this.opsUsers.endSession(value?.startsWith("Bearer ") ? value.slice(7).trim() : "");
  }

  @Post("mfa/setup")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  setup(@Body() dto: OpsTokenDto, @Req() req: { ip?: string }) {
    assertOpsNetwork(this.config, req.ip);
    return this.opsUsers.beginMfaSetup(dto.token);
  }

  @Post("mfa/confirm")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  confirm(@Body() dto: ConfirmOpsMfaDto, @Req() req: { ip?: string }) {
    assertOpsNetwork(this.config, req.ip);
    return this.opsUsers.confirmMfaSetup(dto.token, dto.code);
  }
}
