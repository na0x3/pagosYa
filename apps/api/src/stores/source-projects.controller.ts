import { Body, Controller, Get, Header, Param, ParseIntPipe, Patch, Post, Put, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { EditSourceFileDto, SaveSourceProjectDto, SourceProjectRevisionDto } from "./dto/save-source-project.dto";
import { SourceProjectsService } from "./source-projects.service";
import { SourceGenerationService } from "./source-generation.service";
import { GenerateSourceProjectDto } from "./dto/generate-source-project.dto";

@ApiTags("storefront-source-projects")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
@Controller("v1/stores/:storeId/source-project")
export class SourceProjectsController {
  constructor(private readonly projects: SourceProjectsService, private readonly generation: SourceGenerationService) {}

  @Post("generate")
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  generate(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Body() input: GenerateSourceProjectDto) {
    return this.generation.generate(merchant.id, storeId, input);
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  state(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Query("before", new ParseIntPipe({ optional: true })) before?: number) {
    return this.projects.state(merchant.id, storeId, before);
  }

  @Patch("file")
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  editFile(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Body() input: EditSourceFileDto) {
    return this.projects.editFile(merchant.id, storeId, input);
  }

  @Put()
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  save(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Body() input: SaveSourceProjectDto) {
    return this.projects.save(merchant.id, storeId, input);
  }

  @Get("versions/:revision")
  @Header("Cache-Control", "private, no-store")
  version(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Param("revision", ParseIntPipe) revision: number) {
    return this.projects.version(merchant.id, storeId, revision);
  }

  @Post("versions/:revision/restore")
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  restore(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Param("revision", ParseIntPipe) revision: number, @Body() input: SourceProjectRevisionDto) {
    return this.projects.restore(merchant.id, storeId, revision, input.revision);
  }

  @Get("versions/:revision/export")
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async archive(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Param("revision", ParseIntPipe) revision: number) {
    const { filename, buffer } = await this.projects.archive(merchant.id, storeId, revision);
    return new StreamableFile(buffer, { type: "application/zip", disposition: `attachment; filename="${filename}"`, length: buffer.length });
  }
}
