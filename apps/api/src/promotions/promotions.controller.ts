// promotions.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AdministratorGuard } from '../users/guards/administrator.guard';
import { PasswordStatusGuard } from '../auth/password/password-status.guard';

import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { PromotionsService } from './promotions.service';

@UseGuards(
  AuthGuard('jwt'),
  AdministratorGuard,
  PasswordStatusGuard,
)

@Controller('promotions')
export class PromotionsController {
  constructor(
    private readonly promotionsService: PromotionsService,
  ) {}

  @Get()
  findAll() {
    return this.promotionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.promotionsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePromotionDto) {
    return this.promotionsService.update(id, dto);
  }

}
