import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { InternalOpsGuard } from "../auth/guards/internal-ops.guard";
import { OpsAuthGuard } from "./guards/ops-auth.guard";
import { CurrentOpsUser } from "./decorators/current-ops-user.decorator";
import { OpsUserService } from "./ops-user.service";
import { CreateOpsUserDto } from "./dto/create-ops-user.dto";

@ApiTags("ops")
@Controller("internal/ops_users")
export class OpsUsersController {
  constructor(private readonly opsUsers: OpsUserService) {}

  /**
   * Bootstrapping a new named reviewer — the only thing INTERNAL_OPS_SECRET
   * is still used for. Its blast radius is now "can create an attributable,
   * revocable ops user," not "can silently approve merchants forever."
   */
  @Post()
  @ApiBearerAuth()
  @UseGuards(InternalOpsGuard)
  create(@Body() dto: CreateOpsUserDto) {
    return this.opsUsers.create(dto.name, dto.email);
  }

  @Post(":id/revoke")
  @ApiBearerAuth()
  @UseGuards(InternalOpsGuard)
  revoke(@Param("id") id: string) {
    return this.opsUsers.revoke(id);
  }

  @Get("me")
  @ApiBearerAuth()
  @UseGuards(OpsAuthGuard)
  me(@CurrentOpsUser() opsUser: { id: string; name: string; email: string }) {
    return opsUser;
  }
}
