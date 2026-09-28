import { ConflictException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PasswordHasher } from '../common/security/password-hasher';
import { ClientsService } from '../clients/clients.service';
import { Client } from '../clients/client.model';
import { splitFirstWord } from '../clients/name.util';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly clients: ClientsService,
    private readonly jwt: JwtService,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async register(dto: RegisterDto) {
    // SAFEGUARD: we do not assign a password from the 'Register' form if the account exists
    // This will be managed in the 'User settings' when implemented in the navigation bar.
    if (await this.clients.findByEmail(dto.email)) {
      throw new ConflictException(
        'Este correo ya está registrado. Si usaste Google o Facebook, entra con ese botón.',
      );
    }

    const [firstName, secondName] = splitFirstWord(dto.firstName);
    const [firstSurname, secondSurname] = splitFirstWord(dto.lastName);

    const { passwordHash, salt } = await this.passwordHasher.hash(dto.password);

    const client = await this.clients.createWithLocalCredentials(
      {
        email: dto.email,
        firstName,
        secondName,
        firstSurname,
        secondSurname,
        birthday: dto.birthDate,
        phoneNumber: dto.phone,
        gender: dto.gender,
        language: dto.language,
        acceptedTerms: dto.acceptTerms,
      },
      passwordHash,
      // Public registration historically stores padded Base64 in the SALT column.
      Buffer.from(salt, 'base64').toString('base64'),
    );

    return { id: client.id, email: client.email }; // minimum data needed
  }

  // TODO(Alejandro): Login probably will be here. For clients and employees
  // distinguishing by 'type'('client','employee') on the payload.

  issueToken(client: Client) {
    return {
      accessToken: this.jwt.sign({
        sub: client.id,
        email: client.email,
        type: 'client',
      }),
    };
  }
}
