import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PasswordStatusGuard } from '../auth/password/password-status.guard';
import { AdministratorGuard } from '../users/guards/administrator.guard';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { TransactionIdParamsDto } from './dto/transaction-id-params.dto';
import { TransactionsService } from './transactions.service';

// Only administrators see transactions; employees and clients get 403 without data.
@Controller('transactions')
@UseGuards(AuthGuard('jwt'), AdministratorGuard, PasswordStatusGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get('filter-options')
  listFilterOptions() {
    return this.transactionsService.listFilterOptions();
  }

  @Get()
  listTransactions(@Query() query: ListTransactionsQueryDto) {
    return this.transactionsService.listTransactions(query);
  }

  @Get(':id')
  getTransaction(@Param() params: TransactionIdParamsDto) {
    return this.transactionsService.getTransaction(params.id);
  }
}
