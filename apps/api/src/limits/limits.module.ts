import { Module } from "@nestjs/common";
import { LimitsService } from "./limits.service";
import { LimitsSweepWorker } from "./limits-sweep.worker";

@Module({ providers: [LimitsService, LimitsSweepWorker], exports: [LimitsService] })
export class LimitsModule {}
