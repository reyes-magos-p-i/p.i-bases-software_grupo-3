import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { CreateClientDto } from './dto/create-client.dto';
import type { CreateEmployeeDto } from './dto/create-employee.dto';
import type { CreatedUserDto } from './dto/created-user.dto';
import { CreateUserValidationPipe } from './pipes/create-user-validation.pipe';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(CreateUserValidationPipe) data: CreateClientDto | CreateEmployeeDto,
  ): Promise<CreatedUserDto> {
    return this.usersService.create(data);
  }
}
