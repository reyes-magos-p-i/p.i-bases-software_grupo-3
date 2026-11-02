import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SessionOriginGuard } from '../auth/guards/session-origin.guard';
import { ParseDecimalIdPipe } from '../common/pipes/parse-decimal-id.pipe';
import { PurchaseThrottlerGuard } from './purchase-throttler.guard';
import { PurchaseSelectionDto } from './purchase.dto';
import {
  ConfirmGuestPurchaseDto,
  GuestBuyerDto,
  GuestPurchaseLookupDto,
} from './guest-purchase.dto';
import { GuestPurchasesService } from './guest-purchases.service';

@Controller('guest-purchases')
@UseGuards(PurchaseThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class GuestPurchasesController {
  constructor(private readonly service: GuestPurchasesService) {}

  @Get('movies/:id/functions')
  @Header('Cache-Control', 'no-store')
  functions(@Param('id', ParseDecimalIdPipe) id: string) {
    return this.service.purchases.movieFunctions(Number(id));
  }

  @Get('functions/:id/seats')
  @Header('Cache-Control', 'no-store')
  seats(@Param('id', ParseDecimalIdPipe) id: string) {
    return this.service.purchases.seats(Number(id));
  }

  @Post('quote')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @UseGuards(SessionOriginGuard)
  quote(@Body() data: PurchaseSelectionDto) {
    return this.service.purchases.quote(data);
  }

  @Post('buyer')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @UseGuards(SessionOriginGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  identify(@Body() data: GuestBuyerDto) {
    return this.service.identify(data);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionOriginGuard)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  confirm(@Body() data: ConfirmGuestPurchaseDto) {
    return this.service.confirm(data);
  }

  @Post('lookup')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @UseGuards(SessionOriginGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  lookup(@Body() data: GuestPurchaseLookupDto) {
    return this.service.lookup(data.accessCode);
  }
  @Post('email-status')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @UseGuards(SessionOriginGuard)
  emailStatus(@Body() data: GuestPurchaseLookupDto) {
    return this.service.emailStatus(data.accessCode);
  }
  @Post('resend-tickets')
  @Header('Cache-Control', 'no-store')
  @HttpCode(202)
  @UseGuards(SessionOriginGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  resendTickets(@Body() data: GuestPurchaseLookupDto) {
    return this.service.resendTickets(data.accessCode);
  }
}
