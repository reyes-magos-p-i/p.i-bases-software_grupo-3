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
const SEND_HOUR = 9;
const TIME_ZONE = 'America/Costa_Rica';

interface LocalDate {
  monthKey: string;
  hour: number;
}

function localDate(now: Date): LocalDate {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return {
    monthKey: `${parts.year}-${parts.month}`,
    hour: Number(parts.hour),
  };
}

/**
 * Emails the active promotions to every active client who opted in to promotional emails.
 * Runs at most once per calendar month: the month is claimed in PROMOTIONAL_EMAIL_RUNS before
 * sending, so restarts never resend it. A missed day is sent at the next hourly check.
 */
@Injectable()
export class PromotionalEmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PromotionalEmailService.name);
  private interval: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly repository: PromotionalEmailRepository,
    private readonly sender: SmtpPromotionalEmailSender,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    // Only production sends this email. Development is a copy of production data, so it stays off.
    if (this.config.get<string>('PROMOTIONAL_EMAILS_ENABLED') !== 'true') {
      this.logger.log(
        'Promotional emails are disabled; set PROMOTIONAL_EMAILS_ENABLED=true to enable them.',
      );
      return;
    }
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
    if (this.running || local.hour < SEND_HOUR) return;

    this.running = true;
    try {
      await this.sendMonthly(local.monthKey);
    } finally {
      this.running = false;
    }
  }

  private async sendMonthly(monthKey: string): Promise<void> {
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
    // Failures above leave the month unclaimed, so the next hourly check retries it.
    if (!(await this.repository.claimMonth(monthKey))) {
      this.logger.log(`Promotional email for ${monthKey} was already claimed.`);
      return;
    }

    // One message at a time: the transport does not pool connections, so parallel
    // sends would open one SMTP connection per client.
    const failed = await recipients.reduce<Promise<number>>(
      async (previous, recipient) => {
        const count = await previous;
        try {
          await this.sender.send({
            clientName: recipient.name,
            email: recipient.email,
            promotions,
            billboardUrl,
            preferencesUrl,
          });
          return count;
        } catch (error) {
          this.logger.error(
            `Promotional email failed for client ${recipient.clientId}`,
            error instanceof Error ? error.stack : String(error),
          );
          return count + 1;
        }
      },
      Promise.resolve(0),
    );
    this.logger.log(
      `Monthly promotional email sent to ${recipients.length - failed} of ${recipients.length} clients.`,
    );
  }
}
