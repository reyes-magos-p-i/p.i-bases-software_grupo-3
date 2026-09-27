import { ConflictException, Injectable} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { ClientsService } from '../clients/clients.service';
import { Client } from '../clients/client.model';
import { splitFirstWord } from '../clients/name.util';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly clients: ClientsService,
    private readonly jwt: JwtService,
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

    const salt = randomBytes(16);
    // TODO(rga): Consider eliminating salt from the DB local credentials,
    // argon2 manages salt internally if we dont give one.
    const passwordHash = await argon2.hash(dto.password, { salt });

    const client = await this.clients.createWithLocalCredentials(
      {
        email: dto.email,
        firstName, secondName, firstSurname, secondSurname,
        birthday: dto.birthDate,
        phoneNumber: dto.phone,
        gender: dto.gender,
        language: dto.language,
        acceptedTerms: dto.acceptTerms,
      },
      passwordHash,
      salt.toString('base64'),
    );

    return { id: client.id, email: client.email };  // minimum data needed
  }

  // TODO(Alejandro): Login probably will be here. For clients and employees
  // distinguishing by 'type'('client','employee') on the payload.

  issueToken(client: Client) {
    return {
      accessToken: this.jwt.sign({ sub: client.id, email: client.email, type: 'client' }),
      type: 'employee',  // For front end redirecting
    };
  }
}