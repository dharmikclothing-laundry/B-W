import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";

import { LogisticsService } from "./logistics.service";

@Injectable()
export class AssignmentSchedulerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AssignmentSchedulerService.name);
  private midnightTimer?: NodeJS.Timeout;
  private recoveryTimer?: NodeJS.Timeout;

  constructor(private readonly logistics: LogisticsService) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === "test") return;
    void this.run("startup");
    this.scheduleMidnight();
    this.recoveryTimer = setInterval(() => void this.run("recovery"), 15 * 60_000);
    this.recoveryTimer.unref();
  }

  onModuleDestroy() {
    if (this.midnightTimer) clearTimeout(this.midnightTimer);
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
  }

  private async run(source: string) {
    try {
      const results = await this.logistics.assignDueJobs();
      const assigned = results.filter((result) => result.assigned).length;
      if (assigned) this.logger.log(`${source}: assigned ${assigned} due job(s)`);
    } catch (cause) {
      this.logger.warn(
        `${source}: daily assignment could not complete: ${cause instanceof Error ? cause.message : "unknown error"}`,
      );
    }
  }

  private scheduleMidnight() {
    const now = new Date();
    const indiaNow = new Date(now.getTime() + 330 * 60_000);
    const nextDate = new Date(
      Date.UTC(
        indiaNow.getUTCFullYear(),
        indiaNow.getUTCMonth(),
        indiaNow.getUTCDate() + 1,
      ),
    );
    const delay = Math.max(
      1_000,
      nextDate.getTime() - 330 * 60_000 - now.getTime(),
    );
    this.midnightTimer = setTimeout(async () => {
      await this.run("midnight");
      this.scheduleMidnight();
    }, delay);
    this.midnightTimer.unref();
  }
}
