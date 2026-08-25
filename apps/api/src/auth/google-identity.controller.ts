import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { GoogleIdentityService } from "./google-identity.service";

@ApiTags("auth")
@Controller("v1/auth/google")
export class GoogleIdentityController {
  constructor(private readonly google: GoogleIdentityService) {}

  @Get()
  config() {
    return this.google.clientConfig();
  }
}
