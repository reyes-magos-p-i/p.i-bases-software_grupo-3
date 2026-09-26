import {
  BadRequestException,
  Injectable,
  type PipeTransform,
  ValidationPipe,
} from '@nestjs/common';
import { CreateClientDto } from '../dto/create-client.dto';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { UserRole } from '../enums/user-role.enum';

@Injectable()
export class CreateUserValidationPipe implements PipeTransform<
  unknown,
  Promise<CreateClientDto | CreateEmployeeDto>
> {
  private readonly validationPipe = new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) => {
      const messages = errors.flatMap((error) =>
        Object.entries(error.constraints ?? {}).map(([constraint, message]) =>
          constraint === 'whitelistValidation'
            ? 'La solicitud contiene campos no permitidos.'
            : message,
        ),
      );
      return new BadRequestException(
        [...new Set(messages)],
        'Solicitud inválida',
      );
    },
  });

  async transform(
    value: unknown,
  ): Promise<CreateClientDto | CreateEmployeeDto> {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      Object.keys(value).length === 0
    ) {
      throw new BadRequestException(
        ['El cuerpo de la solicitud debe ser un objeto no vacío.'],
        'Solicitud inválida',
      );
    }

    // These keys can be stripped by Nest or class-transformer before validation.
    if (
      ['__proto__', 'constructor', 'prototype'].some((key) =>
        Object.hasOwn(value, key),
      )
    ) {
      throw new BadRequestException(
        ['La solicitud contiene campos no permitidos.'],
        'Solicitud inválida',
      );
    }

    const role = 'role' in value ? value.role : undefined;
    let metatype: typeof CreateClientDto | typeof CreateEmployeeDto;
    switch (role) {
      case UserRole.CLIENT:
        metatype = CreateClientDto;
        break;
      case UserRole.EMPLOYEE:
      case UserRole.ADMINISTRATOR:
        metatype = CreateEmployeeDto;
        break;
      default:
        throw new BadRequestException(
          ['El rol debe ser administrador, empleado o cliente.'],
          'Solicitud inválida',
        );
    }

    return this.validationPipe.transform(value, { type: 'body', metatype });
  }
}
