import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const CurrentConsumer = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest().consumerUser,
);
