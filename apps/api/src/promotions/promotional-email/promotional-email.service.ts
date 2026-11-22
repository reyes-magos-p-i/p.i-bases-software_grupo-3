import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PromotionalEmailRepository } from './promotional-email.repository';
import { SmtpPromotionalEmailSender } from './smtp-promotional-email-sender';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const SEND_DAY = 1;
const SEND_HOUR = 9;
const TIME_ZONE = 'America/Costa_Rica';

interface LocalDate {
  monthKey: string;
  day: number;
  hour: number;
}

function localDate(now: Date): LocalDate {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return {
    monthKey: `${parts.year}-${parts.month}`,
    day: Number(parts.day),
    hour: Number(parts.hour),
  };
}

/**
 * Emails the active promotions to every active client who opted in to promotional emails.
 * Runs at most once per calendar month. The month is tracked in memory, so a restart on the
 * same day can send the monthly email again.
 */
@Injectable()
export class PromotionalEmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PromotionalEmailService.name);
  private interval: NodeJS.Timeout | undefined;
  private lastSentMonth: string | undefined;
  private running = false;

  constructor(
    private readonly repository: PromotionalEmailRepository,
    private readonly sender: SmtpPromotionalEmailSender,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.interval = setInterval(() => {
      void this.sendIfDue().catch((error: unknown) => {
        this.logger.error(
          'Monthly promotional email run failed.',
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, CHECK_INTERVAL_MS);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  async sendIfDue(now = new Date()): Promise<void> {
    const local = localDate(now);
    if (
      this.running ||
      local.day !== SEND_DAY ||
      local.hour < SEND_HOUR ||
      this.lastSentMonth === local.monthKey
    )
      return;

    this.running = true;
    try {
      await this.sendMonthly();
      this.lastSentMonth = local.monthKey;
    } finally {
      this.running = false;
    }
  }

  private async sendMonthly(): Promise<void> {
    const promotions = await this.repository.findActivePromotions();
    if (!promotions.length) {
      this.logger.log('No active promotions; skipping the monthly email.');
      return;
    }

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const billboardUrl = new URL('/buy-tickets', frontendUrl).href;
    const preferencesUrl = new URL(
      '/account/profile?section=preferences',
      frontendUrl,
    ).href;
    const recipients = await this.repository.findRecipients();

    let failed = 0;
    for (const recipient of recipients) {
      try {
        await this.sender.send({
          clientName: recipient.name,
          email: recipient.email,
          promotions,
          billboardUrl,
          preferencesUrl,
        });
      } catch (error) {
        failed++;
        this.logger.error(
          `Promotional email failed for client ${recipient.clientId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    this.logger.log(
      `Monthly promotional email sent to ${recipients.length - failed} of ${recipients.length} clients.`,
    );
  }
}
