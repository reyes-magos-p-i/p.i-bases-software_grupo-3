import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PasswordGenerator } from '../common/security/password-generator';
import { PasswordHasher } from '../common/security/password-hasher';
import type { CreateClientDto } from './dto/create-client.dto';
import type { CreateEmployeeDto } from './dto/create-employee.dto';
import { CreatedUserDto } from './dto/created-user.dto';
import type { UserCreationOptionsDto } from './dto/user-creation-options.dto';
import type {
  UpdateClientDto,
  UpdateEmployeeDto,
  UserEditOptionsDto,
} from './dto/update-user.dto';
import { UserRole } from './enums/user-role.enum';
import { InitialCredentialsSender } from './notifications/initial-credentials-sender';
import { UsersRepository } from './users.repository';
import { ClientsRepository } from '../clients/clients.repository';
import type {
  ListClientsQueryDto,
  ListEmployeesQueryDto,
} from './dto/list-users-query.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly clientsRepository: ClientsRepository,
    private readonly passwordGenerator: PasswordGenerator,
    private readonly passwordHasher: PasswordHasher,
    private readonly credentialsSender: InitialCredentialsSender,
  ) {}

  getCreationOptions(): Promise<UserCreationOptionsDto> {
    return this.usersRepository.getCreationOptions();
  }

  async getEditOptions(): Promise<UserEditOptionsDto> {
    const { provinces, cantons, districts } = await this.getCreationOptions();
    return { provinces, cantons, districts };
  }

  updateClient(id: number, data: UpdateClientDto) {
    this.requireChanges(data);
    return this.clientsRepository.updateClient(id, data);
  }

  updateEmployee(id: number, data: UpdateEmployeeDto) {
    this.requireChanges(data);
    return this.usersRepository.updateEmployee(id, data);
  }

  private requireChanges(data: UpdateClientDto | UpdateEmployeeDto) {
    if (!Object.values(data).some((value) => value !== undefined)) {
      throw new BadRequestException('No hay cambios para guardar.');
    }
  }

  listClients(query: ListClientsQueryDto) {
    return this.clientsRepository.listClients(query);
  }

  listEmployees(query: ListEmployeesQueryDto) {
    return this.usersRepository.listEmployees(query);
  }

  getEmployeeListOptions() {
    return this.usersRepository.getEmployeeListOptions();
  }

  async getClientDetail(id: number) {
    const user = await this.clientsRepository.findClientDetailById(id);
    if (!user)
      throw new NotFoundException('El usuario seleccionado no existe.');
    return user;
  }

  async getEmployeeDetail(id: number) {
    const user = await this.usersRepository.findEmployeeDetailById(id);
    if (!user)
      throw new NotFoundException('El usuario seleccionado no existe.');
    return user;
  }

  async create(
    data: CreateClientDto | CreateEmployeeDto,
  ): Promise<CreatedUserDto> {
    if (
      data.role !== UserRole.CLIENT &&
      data.role !== UserRole.EMPLOYEE &&
      data.role !== UserRole.ADMINISTRATOR
    ) {
      throw new BadRequestException('El tipo de usuario no es válido.');
    }

    if (
      data.role === UserRole.CLIENT &&
      (await this.clientsRepository.clientEmailExists(data.email))
    ) {
      throw new ConflictException(
        'Ya existe un cliente con ese correo electrónico.',
      );
    }

    const password = this.passwordGenerator.generate();
    const { passwordHash, salt } = await this.passwordHasher.hash(password);
    let id: number;

    if (data.role === UserRole.CLIENT) {
      id = await this.clientsRepository.createClient({
        email: data.email,
        firstName: data.firstName,
        secondName: data.secondName,
        firstSurname: data.firstSurname,
        secondSurname: data.secondSurname,
        birthday: data.birthday,
        phoneNumber: data.phoneNumber,
        address:
          data.address == null
            ? data.address
            : {
                districtId: data.address.districtId,
                details: data.address.details,
              },
        language: data.language,
        passwordHash,
        salt,
      });
    } else {
      id = await this.usersRepository.createEmployee({
        role: data.role,
        email: data.email,
        firstName: data.firstName,
        secondName: data.secondName,
        firstSurname: data.firstSurname,
        secondSurname: data.secondSurname,
        birthday: data.birthday,
        phoneNumber: data.phoneNumber,
        address: {
          districtId: data.address.districtId,
          details: data.address.details,
        },
        branchId: data.branchId,
        hireDate: data.hireDate,
        passwordHash,
        salt,
      });
    }

    try {
      await this.credentialsSender.send({ email: data.email, password });
    } catch {
      throw new BadGatewayException(
        'El usuario fue creado, pero no se pudo enviar el correo con sus credenciales.',
      );
    }

    return new CreatedUserDto({ id, role: data.role, email: data.email });
  }
}
