import { MODULE_METADATA } from '@nestjs/common/constants';
import { TransactionsController } from './transactions.controller';
import { TransactionsModule } from './transactions.module';
import { TransactionsRepository } from './transactions.repository';
import { TransactionsService } from './transactions.service';

describe('TransactionsModule', () => {
  it('wires the controller with its service and repository', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, TransactionsModule),
    ).toEqual([TransactionsController]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, TransactionsModule),
    ).toEqual(
      expect.arrayContaining([TransactionsService, TransactionsRepository]),
    );
  });
});
