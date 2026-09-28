import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ClientsService } from '../../clients/clients.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly clients: ClientsService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: number; type: string }) {
    // TODO(Alejandro): handle also payload.type === 'employee' here.
    // if (payload.type !== 'employee') throw new UnauthorizedException();
    if (payload.type !== 'client') throw new UnauthorizedException();
    // TODO(rga): Hardening. payload.sub have no shape/types validations,
    // if somehow a malicious attacker sign another payload with the jwt secret
    // , payload.sub can be something unexpected.
    const client = await this.clients.findById(payload.sub);  // validate user on DB
    if (!client) throw new UnauthorizedException();
    return client; // This would be stored in req.user -> auth.controller
  }
}

