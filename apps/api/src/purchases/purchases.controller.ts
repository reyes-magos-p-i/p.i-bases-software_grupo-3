import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ClientGuard } from '../clients/profile/guards/client.guard';
import { PasswordStatusGuard } from '../auth/password/password-status.guard';
import { SessionOriginGuard } from '../auth/guards/session-origin.guard';
import { ParseDecimalIdPipe } from '../common/pipes/parse-decimal-id.pipe';
import {
  ConfirmPurchaseDto,
  ListPurchasesQueryDto,
  PurchaseSelectionDto,
} from './purchase.dto';
import { PurchasesService } from './purchases.service';
import { PurchaseThrottlerGuard } from './purchase-throttler.guard';
type ClientRequest = Request & { user: { id: number } };
@Controller('purchases')
@UseGuards(AuthGuard('jwt'), ClientGuard, PasswordStatusGuard)
export class PurchasesController {
  constructor(private readonly service: PurchasesService) {}
  @Get('movies/:id/functions')
  @Header('Cache-Control', 'no-store')
  functions(@Param('id', ParseDecimalIdPipe) id: string) {
    return this.service.movieFunctions(Number(id));
  }
  @Get('functions/:id/seats')
  @Header('Cache-Control', 'no-store')
  seats(@Param('id', ParseDecimalIdPipe) id: string) {
    return this.service.seats(Number(id));
  }
  @Post('quote')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionOriginGuard, PurchaseThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  quote(@Body() data: PurchaseSelectionDto) {
    return this.service.quote(data);
  }
  @Post()
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionOriginGuard, PurchaseThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  confirm(@Req() request: ClientRequest, @Body() data: ConfirmPurchaseDto) {
    return this.service.confirm(request.user.id, data);
  }
  @Get('me')
  @Header('Cache-Control', 'no-store')
  list(@Req() request: ClientRequest, @Query() query: ListPurchasesQueryDto) {
    return this.service.list(request.user.id, query);
  }
  @Get('me/:id')
  @Header('Cache-Control', 'no-store')
  detail(
    @Req() request: ClientRequest,
    @Param('id', ParseDecimalIdPipe) id: string,
  ) {
    return this.service.findOne(request.user.id, Number(id));
  }
}
