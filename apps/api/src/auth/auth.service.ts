import { ConflictException, Injectable} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { ClientsService } from '../clients/clients.service';
import { Client, SocialProfile} from '../clients/client.model';
import { splitFirstWord } from '../clients/name.util';
import { RegisterDto } from './dto/register.dto';
import { OAuth2Client } from 'google-auth-library'; // google lib for authetication

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

  //google auth SIlvio
  async googleLogin(authCode: string){
    //Google clinet inizialitation
    const googleClient = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'postmessage',
    );

    try{
      //rxchange auth code for token from google
      const {tokens} = await googleClient.getToken(authCode);
      const idToken = tokens.id_token;

      if (!idToken){
        throw new ConflictException('unable to acquire toke from google')

      }

      //token verification
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience:process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if(!payload || !payload.email){
        throw new ConflictException('unable to verify with google or email not valid')

      }

      const  googleUser :SocialProfile = {
        provider: 'GOOGLE',
        providerUserId: payload.sub,
        email: payload.email,
        firstName: payload.given_name ?? '',
        lastName: payload.family_name?? '',

      }

      const client = await this.clients.findOrCreateSocial(googleUser);
      const tokensPayload = this.issueToken(client);

      return{
        message: 'authentication success',
        client: {
          id: client.id,
          email: client.email,
          firstName: client.firstName,
        },
        ... tokensPayload,
      };

    }catch (error){
      console.error('Error in google verification', error);
      if (error instanceof ConflictException){
        throw error;
      }
      throw new ConflictException('Error trying to validated google credentials')
    }

  }


  issueToken(client: Client) {
    return {
      accessToken: this.jwt.sign({ sub: client.id, email: client.email, type: 'client' }),
    };
  }
}
