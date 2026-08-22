import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthPrincipal } from '../admin/permissions';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthPrincipal }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException();
    }

    const owned = new Set(user.permissions ?? []);
    if (required.every((permission) => owned.has(permission))) {
      return true;
    }
    throw new ForbiddenException();
  }
}
