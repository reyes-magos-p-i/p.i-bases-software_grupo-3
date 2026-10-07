import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { TheatersService } from './theaters.service';
import { CreateTheaterDto } from './dto/create-theater.dto';
import { UpdateTheaterDto } from './dto/update-theater.dto';
import { AdministratorGuard } from '../users/guards/administrator.guard';
import { AuthGuard } from '@nestjs/passport';
import { PasswordStatusGuard } from '../auth/password/password-status.guard';

@UseGuards(AuthGuard('jwt'), AdministratorGuard, PasswordStatusGuard)
@Controller('theaters')
export class TheatersController {
  constructor(private readonly theatersService: TheatersService) {}

  @Post()
  create(@Body() createTheaterDto: CreateTheaterDto) {
    return this.theatersService.create(createTheaterDto);
  }

  @Get()
  findAll() {
    return this.theatersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.theatersService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTheaterDto: UpdateTheaterDto) {
    return this.theatersService.update(+id, updateTheaterDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.theatersService.remove(+id);
  }
}
