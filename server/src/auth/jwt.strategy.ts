import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: { sub: number; username: string; email?: string },
  ): Promise<{
    id: number;
    username: string;
    email?: string;
  }> {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    // 没有token 或者token 已经标记退出，失效了，抛出异常
    if (!token || (await this.authService.isRevoked(token))) {
      throw new UnauthorizedException();
    }
    return {
      id: payload.sub,
      username: payload.username,
      email: payload.email,
    };
  }
}
