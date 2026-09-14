import { Body, Controller, Get, Header, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { EmailWorkspaceService } from './email-workspace.service';
import { EmailDomainDto, EmailRevisionDto, EmailStaffDto, EmailTemplateDto } from './email-workspace.dto';
@Controller('v1/stores/:storeId/email-workspace')
@UseGuards(MerchantAuthGuard)
export class EmailWorkspaceController {
    constructor(private readonly service: EmailWorkspaceService) { }
    @Get()
    @Header('Cache-Control', 'private, no-store')
    get(
    @CurrentMerchant()
    m: {
        id: string;
    }, 
    @Param('storeId')
    id: string) { return this.service.overview(m.id, id); }
    @Put('templates/:key')
    template(
    @CurrentMerchant()
    m: {
        id: string;
    }, 
    @Param('storeId')
    id: string, 
    @Param('key')
    key: string, 
    @Body()
    dto: EmailTemplateDto) { return this.service.template(m.id, id, key, dto); }
    @Put('staff')
    staff(
    @CurrentMerchant()
    m: {
        id: string;
    }, 
    @Param('storeId')
    id: string, 
    @Body()
    dto: EmailStaffDto) { return this.service.staff(m.id, id, dto); }
    @Post('domain')
    domain(
    @CurrentMerchant()
    m: {
        id: string;
    }, 
    @Param('storeId')
    id: string, 
    @Body()
    dto: EmailDomainDto) { return this.service.domain(m.id, id, dto); }
    @Post('domain/verify')
    verify(
    @CurrentMerchant()
    m: {
        id: string;
    }, 
    @Param('storeId')
    id: string, 
    @Body()
    dto: EmailRevisionDto) { return this.service.verify(m.id, id, dto.revision); }
    @Get('logs')
    @Header('Cache-Control', 'private, no-store')
    logs(
    @CurrentMerchant()
    m: {
        id: string;
    }, 
    @Param('storeId')
    id: string, 
    @Query('before')
    before?: string) { return this.service.logs(m.id, id, before); }
}
