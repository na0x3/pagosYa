import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/** Populated by OpsAuthGuard. */
export const CurrentOpsUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.opsUser;
});
