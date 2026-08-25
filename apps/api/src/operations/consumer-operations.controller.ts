import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ConsumerUser } from "@prisma/client";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ConsumerAuthGuard } from "../consumer/consumer-auth.guard";
import { CurrentConsumer } from "../consumer/current-consumer.decorator";
import { CreateReturnRequestDto } from "./dto/operations.dto";
import { OperationsService } from "./operations.service";

@ApiTags("consumer-operations")
@ApiBearerAuth()
@UseGuards(ConsumerAuthGuard)
@Controller("v1/consumer/operations")
export class ConsumerOperationsController {
  constructor(private readonly operations: OperationsService) {}
  @Get("favorites")
  favorites(@CurrentConsumer() user: ConsumerUser) { return this.operations.consumerFavorites(user.id); }
  @Post("favorites/:paymentLinkId")
  addFavorite(@CurrentConsumer() user: ConsumerUser, @Param("paymentLinkId") paymentLinkId: string) { return this.operations.addFavorite(user.id, paymentLinkId); }
  @Delete("favorites/:paymentLinkId")
  removeFavorite(@CurrentConsumer() user: ConsumerUser, @Param("paymentLinkId") paymentLinkId: string) { return this.operations.removeFavorite(user.id, paymentLinkId); }
  @Post("returns")
  createReturn(@CurrentConsumer() user: ConsumerUser, @Body() dto: CreateReturnRequestDto) { return this.operations.createConsumerReturn(user.id, dto); }
}
