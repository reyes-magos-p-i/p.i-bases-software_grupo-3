import { BadRequestException, Injectable } from '@nestjs/common';
import { ClientsService } from '../clients/clients.service';
import { PurchasesService } from './purchases.service';
import { PurchasesRepository } from './purchases.repository';
import { requireGuestEmailAvailable } from './purchase-rules';
import type {
  ConfirmGuestPurchaseDto,
  GuestBuyerDto,
} from './guest-purchase.dto';

@Injectable()
export class GuestPurchasesService {
  constructor(
    readonly purchases: PurchasesService,
    private readonly repository: PurchasesRepository,
    private readonly clients: ClientsService,
  ) {}

  private matchingEmail(data: GuestBuyerDto) {
    if (data.email !== data.confirmEmail)
      throw new BadRequestException(
        'Los correos electrónicos deben coincidir.',
      );
  }

  async identify(data: GuestBuyerDto) {
    this.matchingEmail(data);
    await this.clients.deleteExpiredPendingClientByEmail(data.email);
    const account = await this.clients.findByEmail(data.email);
    const verificationPending =
      !!account &&
      account.status === 'ACTIVE' &&
      (await this.clients.isEmailVerificationPending(account.id));
    requireGuestEmailAvailable(
      account ? { status: account.status, verificationPending } : null,
    );
    return { email: data.email };
  }

  confirm(data: ConfirmGuestPurchaseDto) {
    this.matchingEmail(data.buyer);
    return this.repository.confirmGuest(data.buyer.email, data);
  }

  lookup(code: string) {
    return this.repository.findGuest(code);
  }
}
