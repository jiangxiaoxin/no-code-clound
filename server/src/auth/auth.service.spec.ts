import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { UserDepartment } from '../admin/department/user-department.entity';
import { RolePermission } from '../admin/role/role-permission.entity';
import { Role } from '../admin/role/role.entity';
import { UserRole } from '../admin/role/user-role.entity';
import { User } from '../user/user.entity';
import { AuthService } from './auth.service';
import { RevokedToken } from './revoked-token.entity';

describe('AuthService', () => {
  let service: AuthService;
  const repo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const jwtService = {
    sign: jest.fn(),
    decode: jest.fn(),
  };
  const revokedRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const userDepartmentRepo = {
    find: jest.fn(),
  };
  const userRoleRepo = {
    find: jest.fn(),
  };
  const roleRepo = {
    find: jest.fn(),
  };
  const rolePermissionRepo = {
    find: jest.fn(),
  };

  const registerDto = {
    email: 'alice@example.com',
    username: 'alice',
    password: 'secret1',
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    userDepartmentRepo.find.mockResolvedValue([]);
    userRoleRepo.find.mockResolvedValue([]);
    roleRepo.find.mockResolvedValue([]);
    rolePermissionRepo.find.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: getRepositoryToken(RevokedToken), useValue: revokedRepo },
        { provide: getRepositoryToken(UserDepartment), useValue: userDepartmentRepo },
        { provide: getRepositoryToken(UserRole), useValue: userRoleRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(RolePermission), useValue: rolePermissionRepo },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  describe('register', () => {
    it('hashes password and returns id+username+email without password', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((x: Partial<User>) => x);
      repo.save.mockImplementation(async (u: Partial<User>) => ({
        id: 1,
        ...u,
      }));

      const result = await service.register(registerDto);

      expect(result).toEqual({
        id: 1,
        username: 'alice',
        email: 'alice@example.com',
      });
      expect(result).not.toHaveProperty('password');
      expect(repo.save).toHaveBeenCalled();
      const saved = repo.save.mock.calls[0][0] as { password: string };
      expect(saved.password).not.toBe('secret1');
    });

    it('throws 409 when username already exists', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 1, username: 'alice' });

      await expect(service.register(registerDto)).rejects.toBeInstanceOf(
        ConflictException,
      );

      try {
        repo.findOne.mockResolvedValueOnce({ id: 1, username: 'alice' });
        await service.register(registerDto);
      } catch (e) {
        expect(e).toBeInstanceOf(ConflictException);
        expect((e as ConflictException).getStatus()).toBe(409);
        expect((e as ConflictException).message).toBe('用户名已存在');
      }
    });

    it('throws 409 when email already exists', async () => {
      repo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 2, email: 'alice@example.com' });

      try {
        await service.register(registerDto);
        throw new Error('expected conflict');
      } catch (e) {
        expect(e).toBeInstanceOf(ConflictException);
        expect((e as ConflictException).getStatus()).toBe(409);
        expect((e as ConflictException).message).toBe('邮箱已存在');
      }
    });

    it('throws 409 when unique index is violated', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((x: Partial<User>) => x);
      repo.save.mockRejectedValue(
        Object.assign(new Error('Duplicate'), { code: 'ER_DUP_ENTRY' }),
      );

      await expect(service.register(registerDto)).rejects.toBeInstanceOf(
        ConflictException,
      );

      try {
        await service.register(registerDto);
      } catch (e) {
        expect((e as ConflictException).getStatus()).toBe(409);
        expect((e as ConflictException).message).toBe('用户名已存在');
      }
    });

    it('throws 409 邮箱已存在 when email unique index is violated', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((x: Partial<User>) => x);
      repo.save.mockRejectedValue(
        Object.assign(new Error('Duplicate'), {
          code: 'ER_DUP_ENTRY',
          sqlMessage: "Duplicate entry 'alice@example.com' for key 'uk_user_email'",
        }),
      );

      try {
        await service.register(registerDto);
        throw new Error('expected conflict');
      } catch (e) {
        expect((e as ConflictException).getStatus()).toBe(409);
        expect((e as ConflictException).message).toBe('邮箱已存在');
      }
    });
  });

  describe('login', () => {
    it('returns token and user on username + correct password', async () => {
      const password = await bcrypt.hash('secret1', 10);
      repo.findOne.mockResolvedValue({
        id: 1,
        username: 'alice',
        email: 'alice@example.com',
        displayName: 'alice',
        status: 'active',
        password,
      });
      jwtService.sign.mockReturnValue('token-abc');

      const result = await service.login({
        username: 'alice',
        password: 'secret1',
      });

      expect(result.accessToken).toBe('token-abc');
      expect(result.user).toMatchObject({
        id: 1,
        username: 'alice',
        email: 'alice@example.com',
        displayName: 'alice',
        status: 'active',
      });
    });

    it('returns token and user on email + correct password', async () => {
      const password = await bcrypt.hash('secret1', 10);
      repo.findOne.mockResolvedValue({
        id: 1,
        username: 'alice',
        email: 'alice@example.com',
        displayName: 'alice',
        status: 'active',
        password,
      });
      jwtService.sign.mockReturnValue('token-abc');

      const result = await service.login({
        username: 'alice@example.com',
        password: 'secret1',
      });

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { email: 'alice@example.com' },
      });
      expect(result.accessToken).toBe('token-abc');
      expect(result.user).toMatchObject({
        id: 1,
        username: 'alice',
        email: 'alice@example.com',
      });
    });

    it('throws 401 when user is missing', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.login({ username: 'alice', password: 'secret1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      try {
        await service.login({ username: 'alice', password: 'secret1' });
      } catch (e) {
        expect((e as UnauthorizedException).getStatus()).toBe(401);
        expect((e as UnauthorizedException).message).toBe(
          '用户名/邮箱或密码错误',
        );
      }
    });

    it('throws 401 with 账号已停用 when user is disabled', async () => {
      repo.findOne.mockResolvedValue({
        id: 1,
        username: 'alice',
        email: 'alice@example.com',
        displayName: 'alice',
        status: 'disabled',
        password: await bcrypt.hash('secret1', 10),
      });

      try {
        await service.login({ username: 'alice', password: 'secret1' });
        throw new Error('expected unauthorized');
      } catch (e) {
        expect(e).toBeInstanceOf(UnauthorizedException);
        expect((e as UnauthorizedException).message).toBe('账号已停用');
      }
    });

    it('throws 401 when password mismatches', async () => {
      const password = await bcrypt.hash('other-pass', 10);
      repo.findOne.mockResolvedValue({
        id: 1,
        username: 'alice',
        email: 'alice@example.com',
        displayName: 'alice',
        status: 'active',
        password,
      });

      await expect(
        service.login({ username: 'alice', password: 'secret1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      try {
        await service.login({ username: 'alice', password: 'secret1' });
      } catch (e) {
        expect((e as UnauthorizedException).message).toBe(
          '用户名/邮箱或密码错误',
        );
      }
    });
  });

  describe('logout', () => {
    it('revokes the current token hash until jwt exp', async () => {
      jwtService.decode.mockReturnValue({ exp: 2000000000 });
      revokedRepo.findOne.mockResolvedValue(null);
      revokedRepo.create.mockImplementation((x: Partial<RevokedToken>) => x);
      revokedRepo.save.mockResolvedValue({});

      await service.logout('jwt-token');

      expect(revokedRepo.save).toHaveBeenCalled();
      const saved = revokedRepo.save.mock.calls[0][0] as {
        tokenHash: string;
        expiresAt: Date;
      };
      expect(saved.tokenHash).toBe(
        createHash('sha256').update('jwt-token').digest('hex'),
      );
      expect(saved.expiresAt).toEqual(new Date(2000000000 * 1000));
    });

    it('skips save when token is already revoked', async () => {
      jwtService.decode.mockReturnValue({ exp: 2000000000 });
      revokedRepo.findOne.mockResolvedValue({ id: 1 });

      await service.logout('jwt-token');

      expect(revokedRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getPrincipal', () => {
    const activeUser = {
      id: 1,
      username: 'alice',
      email: 'alice@example.com',
      displayName: '张三',
      status: 'active' as const,
    };

    it('returns departments, enabled role codes and unique sorted permissions', async () => {
      repo.findOne.mockResolvedValue(activeUser);
      userDepartmentRepo.find.mockResolvedValue([
        { userId: 1, departmentId: 3 },
        { userId: 1, departmentId: 1 },
      ]);
      userRoleRepo.find.mockResolvedValue([
        { userId: 1, roleId: 2 },
        { userId: 1, roleId: 4 },
      ]);
      roleRepo.find.mockResolvedValue([
        { id: 2, code: 'user_admin', status: 'active' },
        { id: 4, code: 'dept_admin', status: 'active' },
      ]);
      rolePermissionRepo.find.mockResolvedValue([
        { roleId: 2, permission: 'users.update' },
        { roleId: 2, permission: 'users.read' },
        { roleId: 4, permission: 'users.read' },
        { roleId: 4, permission: 'departments.read' },
      ]);

      await expect(service.getPrincipal(1)).resolves.toEqual({
        id: 1,
        username: 'alice',
        email: 'alice@example.com',
        displayName: '张三',
        status: 'active',
        departmentIds: [1, 3],
        roleCodes: ['dept_admin', 'user_admin'],
        permissions: ['departments.read', 'users.read', 'users.update'],
      });
    });

    it('does not grant permissions from disabled roles', async () => {
      repo.findOne.mockResolvedValue(activeUser);
      userRoleRepo.find.mockResolvedValue([
        { userId: 1, roleId: 2 },
        { userId: 1, roleId: 5 },
      ]);
      roleRepo.find.mockResolvedValue([
        { id: 2, code: 'user_admin', status: 'active' },
      ]);
      rolePermissionRepo.find.mockResolvedValue([
        { roleId: 2, permission: 'users.read' },
      ]);

      const result = await service.getPrincipal(1);
      expect(result.roleCodes).toEqual(['user_admin']);
      expect(result.permissions).toEqual(['users.read']);
    });

    it('throws UnauthorizedException when user is disabled', async () => {
      repo.findOne.mockResolvedValue({ ...activeUser, status: 'disabled' });

      await expect(service.getPrincipal(1)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when user is missing', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.getPrincipal(99)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('isRevoked', () => {
    it('returns true when token hash exists', async () => {
      revokedRepo.findOne.mockResolvedValue({ id: 1 });
      await expect(service.isRevoked('jwt-token')).resolves.toBe(true);
    });

    it('returns false when token hash is missing', async () => {
      revokedRepo.findOne.mockResolvedValue(null);
      await expect(service.isRevoked('jwt-token')).resolves.toBe(false);
    });
  });
});
