import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientsRepository } from '../clients.repository';
import { UsersRepository } from '../../users/users.repository';
import type { UpdateClientProfileDto } from './client-profile.dto';

@Injectable()
export class ClientProfileService {
  constructor(
    private readonly clients: ClientsRepository,
    private readonly users: UsersRepository,
  ) {}

  async getProfile(id: number) {
    const profile = await this.clients.findClientDetailById(id);
    if (!profile || profile.status !== 'ACTIVE')
      throw new UnauthorizedException(
        'Tu sesión terminó. Inicia sesión nuevamente.',
      );
    return profile;
  }

  getAddressOptions() {
    return this.users.getAddressOptions();
  }

  async updateProfile(id: number, data: UpdateClientProfileDto): Promise<void> {
    if (!Object.values(data).some((value) => value !== undefined)) {
      throw new BadRequestException('No hay cambios para guardar.');
    }
    await this.clients.updateClient(id, data);
  }

  deactivate(id: number): Promise<void> {
    return this.clients.deactivateClient(id);
  }
}
