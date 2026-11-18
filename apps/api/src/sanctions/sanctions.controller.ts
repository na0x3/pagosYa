import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { OpsRole } from "@prisma/client";
import { IsIn, IsString, Length } from "class-validator";
import { OpsAuthGuard } from "../ops/guards/ops-auth.guard";
import { CurrentOpsUser } from "../ops/decorators/current-ops-user.decorator";
import { SanctionsService } from "./sanctions.service";

class ResolveScreeningDto {
  @IsIn(["DISMISSED", "CONFIRMED"]) decision!: "DISMISSED" | "CONFIRMED";
  @IsString() @Length(10, 1000) note!: string;
}

type OpsActor = { id: string; name: string; email: string; role: OpsRole };

/** Ops: the state of the lists, a manual refresh, and deciding possible matches. */
@ApiTags("ops")
@ApiBearerAuth()
@UseGuards(OpsAuthGuard)
@Controller("internal/sanctions")
export class SanctionsController {
  constructor(private readonly sanctions: SanctionsService) {}

  @Get() status() { return this.sanctions.status(); }

  @Get("screenings") open() { return this.sanctions.listOpen(); }

  @Post("import")
  importNow(@CurrentOpsUser() actor: OpsActor) {
    if (actor.role !== OpsRole.SUPPORT_ADMIN) throw new ForbiddenException("Solo un administrador actualiza las listas");
    return this.sanctions.importLists(actor);
  }

  @Post("screenings/:id/resolve")
  resolve(@Param("id") id: string, @Body() dto: ResolveScreeningDto, @CurrentOpsUser() actor: OpsActor) {
    return this.sanctions.resolve(id, dto.decision, dto.note, actor);
  }
}
