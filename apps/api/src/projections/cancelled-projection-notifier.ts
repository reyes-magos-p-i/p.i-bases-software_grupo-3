import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CancelledProjectionEmailSender } from './notifications/cancelled-projection-email-sender';
import { ProjectionsRepository } from './projections.repository';

/** Emails every client holding a ticket for a cancelled projection. Never throws. */
@Injectable()
export class CancelledProjectionNotifier {
  private readonly logger = new Logger(CancelledProjectionNotifier.name);

  constructor(
    private readonly repository: ProjectionsRepository,
    private readonly sender: CancelledProjectionEmailSender,
    private readonly config: ConfigService,
  ) {}

  async notify(projectionId: number): Promise<void> {
    try {
      const recipients =
        await this.repository.findCancellationRecipients(projectionId);
      const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
      await Promise.all(
        recipients.map(async (recipient) => {
          try {
            await this.sender.send({
              ...recipient,
              changeUrl: new URL(
                `/cancelled-tickets/${recipient.ticketId}`,
                frontendUrl,
              ).href,
            });
          } catch (error) {
            this.logger.error(
              `Cancellation email failed for ticket ${recipient.ticketId}`,
              error as Error,
            );
          }
        }),
      );
    } catch (error) {
      this.logger.error(
        `Cancellation notifications failed for projection ${projectionId}`,
        error as Error,
      );
    }
  }
}
