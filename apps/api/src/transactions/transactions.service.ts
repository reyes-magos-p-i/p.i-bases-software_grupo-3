import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TransactionsRepository } from './transactions.repository';
import type { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly transactionsRepository: TransactionsRepository) {}

  listTransactions(query: ListTransactionsQueryDto) {
    // Both are "YYYY-MM-DD", so comparing the text compares the dates.
    if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo)
      throw new BadRequestException(
        'La fecha de inicio no puede ser posterior a la fecha de fin.',
      );
    return this.transactionsRepository.listTransactions(query);
  }

  listFilterOptions() {
    return this.transactionsRepository.listFilterOptions();
  }

  // Pending or failed invoices are not transactions, so they answer 404 too.
  async getTransaction(id: number) {
    const transaction =
      await this.transactionsRepository.findTransactionById(id);
    if (!transaction)
      throw new NotFoundException(
        'No fue posible cargar el detalle de la transacción',
      );
    return transaction;
  }
}
