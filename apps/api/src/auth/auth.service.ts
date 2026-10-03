import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { PasswordHasher } from '../common/security/password-hasher';
import { ClientsService } from '../clients/clients.service';
import { ConfigService } from '@nestjs/config';
import { Client, SocialProfile} from '../clients/client.model';
import { splitFirstWord } from '../clients/name.util';
import { RegisterDto } from './dto/register.dto';
import { OAuth2Client } from 'google-auth-library'; // google lib for authetication
import { UsersRepository } from '../users/users.repository';
import type { LoginDto } from './dto/login.dto';
import type { EmployeeLoginResult } from './types/employee-login-result.type';
import { EmailVerificationSender } from './notifications/email-verification-sender';

// This non-account hash keeps missing credentials on the password verification path.
const LOGIN_REFERENCE_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$AAECAwQFBgcICQoLDA0ODw$/tXTH42HzfyOlS8JzgvppUM1iWQlrRk8rqbsEK11dfE';

@Injectable()
export class AuthService {
  constructor(
    private readonly clients: ClientsService,
    private readonly jwt: JwtService,
    private readonly passwordHasher: PasswordHasher,
    private readonly config: ConfigService,
    private readonly usersRepository: UsersRepository,
    private readonly verificationSender: EmailVerificationSender,
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

    const token = this.createVerificationToken();
    const expiresInMinutes = this.verificationTtlMinutes();
    const { passwordHash, salt } = await this.passwordHasher.hash(dto.password);

    const client = await this.clients.createPendingWithLocalCredentials(
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
      token.hash,
      expiresInMinutes,
    );

    await this.sendVerificationEmail(
      client.email,
      token.value,
      expiresInMinutes,
    );
    return { status: 'pending_verification', email: client.email };
  }

  async resendEmailVerification(email: string): Promise<{ message: string }> {
    const client = await this.clients.findPendingLocalClientByEmail(email);
    if (!client) {
      return {
        message:
          'Si existe una cuenta pendiente con ese correo, enviaremos un nuevo enlace.',
      };
    }
    const token = this.createVerificationToken();
    const expiresInMinutes = this.verificationTtlMinutes();
    await this.clients.replaceEmailVerification(
      client.id,
      token.hash,
      expiresInMinutes,
    );
    await this.sendVerificationEmail(
      client.email,
      token.value,
      expiresInMinutes,
    );
    return {
      message: 'Si existe una cuenta pendiente con ese correo, enviaremos un nuevo enlace.',
    };
  }

  async confirmEmailVerification(token: string) {
    const client = await this.clients.consumeEmailVerification(
      this.hashVerificationToken(token),
    );
    if (!client) {
      throw new BadRequestException({
        code: 'EMAIL_VERIFICATION_INVALID',
        message: 'Este enlace ya no es válido',
      });
    }
    return {
      accessToken: this.issueToken(client).accessToken,
      client: this.clientIdentity(client),
    };
  }

  private createVerificationToken() {
    const value = randomBytes(32).toString('hex');
    return { value, hash: this.hashVerificationToken(value) };
  }

  private hashVerificationToken(token: string): string {
    return createHash('sha256').update(token, 'ascii').digest('hex');
  }

  private verificationTtlMinutes(): number {
    const configured = this.config.get<unknown>('EMAIL_VERIFICATION_TTL_MINUTES');
    if (configured === undefined) return 30;
    if (
      typeof configured !== 'string' ||
      !/^[1-9]\d{0,3}$/u.test(configured) ||
      Number(configured) > 1440
    ) {
      throw new Error(
        'EMAIL_VERIFICATION_TTL_MINUTES must be an integer between 1 and 1440.',
      );
    }
    return Number(configured);
  }

  private async sendVerificationEmail(
    email: string,
    token: string,
    expiresInMinutes: number,
  ) {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const confirmationUrl = new URL('/verify-email', frontendUrl);
    confirmationUrl.searchParams.set('token', token);
    try {
      await this.verificationSender.send({
        email,
        confirmationUrl: confirmationUrl.toString(),
        expiresInMinutes,
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'EMAIL_DELIVERY_FAILED',
        message:
          'No se pudo enviar el correo de confirmación. Puedes solicitar que se reenvíe.',
      });
    }
  }

  private clientIdentity(client: Client) {
    return {
      id: client.id,
      email: client.email,
      firstName: client.firstName,
      lastName: client.firstSurname ?? '',
    };
  }

  async loginEmployee(dto: LoginDto): Promise<EmployeeLoginResult> {
    const employee =
      await this.usersRepository.findEmployeeWithLocalCredentialsByEmail(
        dto.email,
      );
    const matches = await this.passwordHasher.verify(
      dto.password,
      employee?.passwordHash ?? LOGIN_REFERENCE_HASH,
    );
    if (!employee || !matches) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    const accessToken = await this.jwt.signAsync({
      sub: employee.id,
      type: 'employee',
    });
    return {
      accessToken,
      user: {
        id: employee.id,
        role: employee.role,
        email: employee.email,
        firstName: employee.firstName,
        secondName: employee.secondName,
        firstSurname: employee.firstSurname,
        secondSurname: employee.secondSurname,
      },
    };
  }

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
        throw new ConflictException('unable to acquire token from google')

      }

      //token verification
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience:process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if(!payload?.email || payload.email_verified !== true){
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
          lastName: client.firstSurname ?? '',
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
      accessToken: this.jwt.sign({
        sub: client.id,
        email: client.email,
        type: 'client',
      }),
    };
  }

  async facebookLogin(accessToken: string) {
    if (!accessToken) {
      throw new BadRequestException('Facebook access token is required');
    }

    const appId = this.config.getOrThrow<string>('FACEBOOK_APP_ID');
    const appSecret = this.config.getOrThrow<string>('FACEBOOK_APP_SECRET');
    const appAccessToken = `${appId}|${appSecret}`;

    const debugUrl = new URL('https://graph.facebook.com/v21.0/debug_token');
    debugUrl.searchParams.set('input_token', accessToken);
    debugUrl.searchParams.set('access_token', appAccessToken);

    const debugResponse = await fetch(debugUrl);
    // CHECK: token is valid
    const debugResult = (await debugResponse.json()) as {
      data?: {
        app_id?: string;
        user_id?: string;
        is_valid?: boolean;
      };
    };

    const tokenData = debugResult.data;
    // CHECK: token belongs to app
    if (
      !debugResponse.ok ||
      !tokenData?.is_valid ||
      tokenData.app_id !== appId ||
      !tokenData.user_id
    ) {
      throw new UnauthorizedException('Invalid Facebook access token');
    }

    const profileUrl = new URL('https://graph.facebook.com/v21.0/me');
    profileUrl.searchParams.set(
      'fields',
      'id,email,first_name,last_name',
    );
    profileUrl.searchParams.set('access_token', accessToken);

    const profileResponse = await fetch(profileUrl);
    const profile = (await profileResponse.json()) as {
      id?: string;
      email?: string;
      first_name?: string;
      last_name?: string;
    };
    // CHECK: token user_id matches profile id
    if (
      !profileResponse.ok ||
      profile.id !== tokenData.user_id ||
      !profile.email
    ) {
      throw new UnauthorizedException(
        'Could not verify Facebook profile',
      );
    }
    // CHECK: email is verified by Facebook
    const socialProfile: SocialProfile = {
      provider: 'FACEBOOK',
      providerUserId: profile.id,
      email: profile.email,
      firstName: profile.first_name ?? '',
      lastName: profile.last_name ?? '',
    };

    const client = await this.clients.findOrCreateSocial(socialProfile);

    return {
      ...this.issueToken(client),
      client: {
        id: client.id,
        email: client.email,
        firstName: client.firstName,
        lastName: client.firstSurname ?? '',
      },
    };
  }

}
