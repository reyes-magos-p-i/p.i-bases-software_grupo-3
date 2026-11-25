import { Injectable } from '@nestjs/common';
import { UpdateClientPromotionalEmailsDto } from './client-promotional-emails.dto';
import { ClientPromotionalEmailsRepository } from './client-promotional-emails.repository';

@Injectable()
export class ClientPromotionalEmailsService {
  constructor(private readonly repository: ClientPromotionalEmailsRepository) {}

  async getSetting(id: number) {
    return { enabled: await this.repository.getOptIn(id) };
  }

  async save(id: number, data: UpdateClientPromotionalEmailsDto) {
    return { enabled: await this.repository.setOptIn(id, data.enabled) };
  }
}
