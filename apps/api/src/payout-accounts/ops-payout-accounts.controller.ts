import { Body, Controller, Get, Param, Post, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { OpsAuthGuard } from "../ops/guards/ops-auth.guard";
import { CurrentOpsUser } from "../ops/decorators/current-ops-user.decorator";
import { PayoutAccountActor, PayoutAccountsService } from "./payout-accounts.service";
import { ApprovePayoutAccountDto, RejectPayoutAccountDto } from "./dto/payout-account.dto";

@ApiTags("ops")
@ApiBearerAuth()
@UseGuards(OpsAuthGuard)
@Controller("internal/payout_accounts")
export class OpsPayoutAccountsController {
  constructor(private readonly accounts: PayoutAccountsService) {}

  @Get() queue() { return this.accounts.pendingQueue(); }

  @Get(":id/proof")
  async proof(@Param("id") id: string, @CurrentOpsUser() actor: PayoutAccountActor) {
    const file = await this.accounts.proof(id, actor);
    return new StreamableFile(file.bytes, { type: file.contentType, disposition: `inline; filename="${file.fileName}"` });
  }

  @Post(":id/approve") approve(@Param("id") id: string, @Body() dto: ApprovePayoutAccountDto, @CurrentOpsUser() actor: PayoutAccountActor) { return this.accounts.approve(id, dto, actor); }
  @Post(":id/reject") reject(@Param("id") id: string, @Body() dto: RejectPayoutAccountDto, @CurrentOpsUser() actor: PayoutAccountActor) { return this.accounts.reject(id, dto.reason, actor); }
}
