import { Body, Controller, Get, Header, Headers, Param, Post, UnauthorizedException } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JoinMembershipDto } from "./dto/join-membership.dto";
import { MembershipsService } from "./memberships.service";

/** Same bearer rule as the store-customers controller: the account token travels as `Authorization: Bearer <token>`. */
function bearer(header: string | undefined): string {
  const match = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(header ?? "");
  if (!match) throw new UnauthorizedException("Inicia sesión para continuar");
  return match[1];
}

@Controller("v1/stores/public/:slug/customers/me/memberships")
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get() @Header("Cache-Control", "no-store") @Throttle({ default: { limit: 60, ttl: 60_000 } })
  list(@Param("slug") slug: string, @Headers("authorization") authorization?: string) { return this.memberships.list(slug, bearer(authorization)); }

  @Post() @Header("Cache-Control", "no-store") @Throttle({ default: { limit: 10, ttl: 60_000 } })
  join(@Param("slug") slug: string, @Body() dto: JoinMembershipDto, @Headers("authorization") authorization?: string) { return this.memberships.startJoin(slug, bearer(authorization), dto); }
}
