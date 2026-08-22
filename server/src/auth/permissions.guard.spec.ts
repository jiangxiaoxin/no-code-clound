import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const guard = new PermissionsGuard(reflector as unknown as Reflector);

  function contextWithUser(user?: { permissions?: string[] }): ExecutionContext {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('allows request when no permissions are declared', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(contextWithUser({ permissions: [] }))).toBe(true);
  });

  it('allows request when user has every required permission', () => {
    reflector.getAllAndOverride.mockReturnValue(['users.read', 'users.update']);

    expect(
      guard.canActivate(
        contextWithUser({ permissions: ['users.read', 'users.update', 'roles.read'] }),
      ),
    ).toBe(true);
  });

  it('throws ForbiddenException when any required permission is missing', () => {
    reflector.getAllAndOverride.mockReturnValue(['users.read', 'users.update']);

    expect(() =>
      guard.canActivate(contextWithUser({ permissions: ['users.read'] })),
    ).toThrow(ForbiddenException);
  });
});
