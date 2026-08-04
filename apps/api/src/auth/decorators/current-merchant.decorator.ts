import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/** Populated by SecretApiKeyGuard. */
export const CurrentMerchant = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.merchant;
});
