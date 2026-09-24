import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { RetentionModule } from "../retention/retention.module";
import { EmailWorkspaceController } from "./email-workspace.controller";
import { EmailWorkspaceService } from "./email-workspace.service";

/** A store's email templates, sending domain, and delivery log. Plain helpers for queueing
 * store emails live in email-workspace.config.ts and are used by other modules directly. */
@Module({
  imports: [DashboardModule, AuthModule, RetentionModule],
  controllers: [EmailWorkspaceController],
  providers: [EmailWorkspaceService],
})
export class EmailWorkspaceModule {}
