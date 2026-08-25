import { BadRequestException, Controller, Get, Query, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { GoogleCalendarService } from "./google-calendar.service";

@Controller("v1/calendar/google")
export class CalendarOauthController {
  constructor(private readonly calendar: GoogleCalendarService, private readonly config: ConfigService) {}
  @Get("callback")
  async callback(@Query("state") state: string, @Query("code") code: string, @Query("error") error: string | undefined, @Res() response: Response) {
    if (error) throw new BadRequestException(`Google Calendar: ${error}`);
    if (!state || !code) throw new BadRequestException("Missing Google Calendar authorization data");
    const connection = await this.calendar.completeAuthorization(state, code);
    const origin = this.config.get<string>("app.merchantDashboardOrigin") ?? "http://localhost:4322";
    response.redirect(`${origin.replace(/\/$/, "")}/?calendar=connected&store=${encodeURIComponent(connection.storeId)}#dashboard-operations`);
  }
}
