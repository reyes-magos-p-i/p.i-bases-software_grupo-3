// promotions.controller.ts
import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AdministratorGuard } from '../users/guards/administrator.guard';
import { PasswordStatusGuard } from '../auth/password/password-status.guard';

import { CreatePromotionDto } from './dto/create-promotion.dto';
import { PromotionsService } from './promotions.service';
/*
@UseGuards(
  AuthGuard('jwt'),
  AdministratorGuard,
  PasswordStatusGuard,
)
*/
@Controller('promotions')
export class PromotionsController {
  constructor(
    private readonly promotionsService: PromotionsService,
  ) {}

  @Post()
  create(@Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(dto);
  }
}
