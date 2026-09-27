import { Injectable } from '@nestjs/common';
import { HealthRepository } from './health.repository/health.repository';

@Injectable()
export class HealthService {
  constructor(private readonly healthRepository: HealthRepository) {}

  findAll() {
    return this.healthRepository.checkDatabaseConnection();
  }
}
