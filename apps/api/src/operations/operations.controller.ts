import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { GoogleCalendarService } from "./google-calendar.service";
import { OperationsService } from "./operations.service";
import {
  AdjustInventoryDto, AdjustLoyaltyDto, AssignDeliveryDto, ClosePosSessionDto,
  CreateAppointmentDto, CreateAppointmentOfferingDto, CreateAutomationDto,
  CreateBusinessCustomerDto, CreateCourierDto, CreateDeliveryZoneDto,
  CreateIntegrationDto, CreatePosSaleDto, CreatePosSessionDto, CreateProductMappingDto,
  CreatePurchaseOrderDto, CreateReconciliationImportDto, CreateSubscriptionDto,
  CreateSubscriptionPlanDto, CreateSubscriptionPlanMappingDto, CreateSupplierDto, ResolveReturnRequestDto,
  RetrySubscriptionInvoiceDto, UpdateAppointmentDto, UpdateSubscriptionPlanDto, UpdateSubscriptionStatusDto,
} from "./dto/operations.dto";

type MerchantRequest = { merchant: { id: string } };

@ApiTags("operations")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
@Controller("v1/stores/:storeId/operations")
export class OperationsController {
  constructor(private readonly operations: OperationsService, private readonly calendar: GoogleCalendarService) {}
  private merchantId(req: MerchantRequest) { return req.merchant.id; }

  @Get()
  hub(@Req() req: MerchantRequest, @Param("storeId") storeId: string) { return this.operations.hub(this.merchantId(req), storeId); }
  @Post("customers")
  createCustomer(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Body() dto: CreateBusinessCustomerDto) { return this.operations.createCustomer(this.merchantId(req), storeId, dto); }
  @Post("customers/sync")
  syncCustomers(@Req() req: MerchantRequest, @Param("storeId") storeId: string) { return this.operations.syncCustomers(this.merchantId(req), storeId); }
  @Post("customers/:customerId/loyalty")
  adjustLoyalty(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("customerId") customerId: string, @Body() dto: AdjustLoyaltyDto) { return this.operations.adjustLoyalty(this.merchantId(req), storeId, customerId, dto); }
  @Post("automations")
  createAutomation(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Body() dto: CreateAutomationDto) { return this.operations.createAutomation(this.merchantId(req), storeId, dto); }
  @Post("automations/run")
  runAutomations(@Req() req: MerchantRequest, @Param("storeId") storeId: string) { return this.operations.runAutomations(this.merchantId(req), storeId); }
  @Post("delivery/zones")
  createDeliveryZone(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Body() dto: CreateDeliveryZoneDto) { return this.operations.createDeliveryZone(this.merchantId(req), storeId, dto); }
  @Post("delivery/couriers")
  createCourier(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Body() dto: CreateCourierDto) { return this.operations.createCourier(this.merchantId(req), storeId, dto); }
  @Patch("delivery/orders/:orderId")
  assignDelivery(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("orderId") orderId: string, @Body() dto: AssignDeliveryDto) { return this.operations.assignDelivery(this.merchantId(req), storeId, orderId, dto); }
  @Post("suppliers")
  createSupplier(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Body() dto: CreateSupplierDto) { return this.operations.createSupplier(this.merchantId(req), storeId, dto); }
  @Post("purchase-orders")
  createPurchaseOrder(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Body() dto: CreatePurchaseOrderDto) { return this.operations.createPurchaseOrder(this.merchantId(req), storeId, dto); }
  @Post("purchase-orders/:id/receive")
  receivePurchaseOrder(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("id") id: string) { return this.operations.receivePurchaseOrder(this.merchantId(req), storeId, id); }
  @Post("inventory/adjust")
  adjustInventory(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Body() dto: AdjustInventoryDto) { return this.operations.adjustInventory(this.merchantId(req), storeId, dto); }
  @Post("reconciliation")
  reconcile(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Body() dto: CreateReconciliationImportDto) { return this.operations.reconcile(this.merchantId(req), storeId, dto); }
  @Get("returns")
  returns(@Req() req: MerchantRequest, @Param("storeId") storeId: string) { return this.operations.listReturns(this.merchantId(req), storeId); }
  @Patch("returns/:id")
  resolveReturn(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: ResolveReturnRequestDto) { return this.operations.resolveReturn(this.merchantId(req), storeId, id, dto); }
  @Post("pos/sessions")
  createPosSession(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Body() dto: CreatePosSessionDto) { return this.operations.createPosSession(this.merchantId(req), storeId, dto); }
  @Patch("pos/sessions/:id/close")
  closePosSession(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: ClosePosSessionDto) { return this.operations.closePosSession(this.merchantId(req), storeId, id, dto); }
  @Post("pos/sales")
  createPosSale(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Body() dto: CreatePosSaleDto) { return this.operations.createPosSale(this.merchantId(req), storeId, dto); }
  @Post("integrations")
  createIntegration(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Body() dto: CreateIntegrationDto) { return this.operations.createIntegration(this.merchantId(req), storeId, dto); }
  @Get("integrations")
  listIntegrations(@Req() req: MerchantRequest, @Param("storeId") storeId: string) { return this.operations.listIntegrations(this.merchantId(req), storeId); }
  @Get("integrations/:id/mappings")
  listProductMappings(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("id") id: string) { return this.operations.listProductMappings(this.merchantId(req), storeId, id); }
  @Delete("integrations/:id/mappings/:mappingId")
  deleteProductMapping(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("id") id: string, @Param("mappingId") mappingId: string) { return this.operations.deleteProductMapping(this.merchantId(req), storeId, id, mappingId); }
  @Post("integrations/:id/mappings")
  createProductMapping(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: CreateProductMappingDto) { return this.operations.createProductMapping(this.merchantId(req), storeId, id, dto); }
  @Post("integrations/:id/subscription-plan-mappings")
  createSubscriptionPlanMapping(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: CreateSubscriptionPlanMappingDto) { return this.operations.createSubscriptionPlanMapping(this.merchantId(req), storeId, id, dto); }
  @Post("appointment-services")
  createAppointmentOffering(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Body() dto: CreateAppointmentOfferingDto) { return this.operations.createAppointmentOffering(this.merchantId(req), storeId, dto); }
  @Post("appointments")
  createAppointment(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Body() dto: CreateAppointmentDto) { return this.operations.createAppointment(this.merchantId(req), storeId, dto); }
  @Patch("appointments/:id")
  updateAppointment(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: UpdateAppointmentDto) { return this.operations.updateAppointment(this.merchantId(req), storeId, id, dto); }
  @Get("calendar/events")
  calendarEvents(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Query("timeMin") timeMin: string, @Query("timeMax") timeMax: string) {
    if (!timeMin || !timeMax || Number.isNaN(Date.parse(timeMin)) || Number.isNaN(Date.parse(timeMax))) throw new BadRequestException("timeMin and timeMax must be ISO dates");
    const start = new Date(timeMin);
    const end = new Date(timeMax);
    if (end <= start || end.getTime() - start.getTime() > 370 * 86_400_000) throw new BadRequestException("Calendar range must be positive and no longer than 370 days");
    return this.operations.calendarEvents(this.merchantId(req), storeId, start, end);
  }
  @Get("calendar/google/authorize")
  authorizeCalendar(@Req() req: MerchantRequest, @Param("storeId") storeId: string) { return this.calendar.authorizationUrl(this.merchantId(req), storeId); }
  @Get("calendar/freebusy")
  freeBusy(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Query("timeMin") timeMin: string, @Query("timeMax") timeMax: string) {
    if (!timeMin || !timeMax || Number.isNaN(Date.parse(timeMin)) || Number.isNaN(Date.parse(timeMax))) throw new BadRequestException("timeMin and timeMax must be ISO dates");
    return this.calendar.freeBusy(this.merchantId(req), storeId, new Date(timeMin), new Date(timeMax));
  }
  @Post("subscription-plans")
  createSubscriptionPlan(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Body() dto: CreateSubscriptionPlanDto) { return this.operations.createSubscriptionPlan(this.merchantId(req), storeId, dto); }
  @Patch("subscription-plans/:id")
  updateSubscriptionPlan(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: UpdateSubscriptionPlanDto) { return this.operations.updateSubscriptionPlan(this.merchantId(req), storeId, id, dto); }
  @Post("subscriptions")
  createSubscription(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Body() dto: CreateSubscriptionDto) { return this.operations.createSubscription(this.merchantId(req), storeId, dto); }
  @Patch("subscriptions/:id")
  updateSubscriptionStatus(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: UpdateSubscriptionStatusDto) { return this.operations.updateSubscriptionStatus(this.merchantId(req), storeId, id, dto); }
  @Post("subscriptions/generate-invoices")
  generateSubscriptionInvoices(@Req() req: MerchantRequest, @Param("storeId") storeId: string) { return this.operations.generateSubscriptionInvoices(this.merchantId(req), storeId); }
  @Post("subscription-invoices/:id/remind")
  remindSubscriptionInvoice(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: RetrySubscriptionInvoiceDto) { return this.operations.remindSubscriptionInvoice(this.merchantId(req), storeId, id, dto.regenerate === true); }
}
