import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
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

  const registerDto = {
    email: 'alice@example.com',
    username: 'alice',
    password: 'secret1',
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: getRepositoryToken(RevokedToken), useValue: revokedRepo },
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
        password,
      });
      jwtService.sign.mockReturnValue('token-abc');

      const result = await service.login({
        username: 'alice',
        password: 'secret1',
      });

      expect(result).toEqual({
        accessToken: 'token-abc',
        user: { id: 1, username: 'alice', email: 'alice@example.com' },
      });
    });

    it('returns token and user on email + correct password', async () => {
      const password = await bcrypt.hash('secret1', 10);
      repo.findOne.mockResolvedValue({
        id: 1,
        username: 'alice',
        email: 'alice@example.com',
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
      expect(result.user).toEqual({
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

    it('throws 401 when password mismatches', async () => {
      const password = await bcrypt.hash('other-pass', 10);
      repo.findOne.mockResolvedValue({
        id: 1,
        username: 'alice',
        email: 'alice@example.com',
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
