import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RevokedToken } from './revoked-token.entity';

const LOGIN_FAILED = '用户名/邮箱或密码错误';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RevokedToken)
    private readonly revokedRepo: Repository<RevokedToken>,
    private readonly jwtService: JwtService,
  ) {}

  async register(
    dto: RegisterDto,
  ): Promise<{ id: number; username: string; email: string }> {
    const email = dto.email.trim().toLowerCase();
    const username = dto.username.trim();

    const byUsername = await this.userRepo.findOne({ where: { username } });
    if (byUsername) {
      throw new ConflictException('用户名已存在');
    }
    const byEmail = await this.userRepo.findOne({ where: { email } });
    if (byEmail) {
      throw new ConflictException('邮箱已存在');
    }

    const password = await bcrypt.hash(dto.password, 10);
    try {
      const user = await this.userRepo.save(
        this.userRepo.create({ username, email, password }),
      );
      return { id: user.id, username: user.username, email: user.email };
    } catch (e) {
      if (this.isDuplicateEntry(e)) {
        throw new ConflictException(this.duplicateConflictMessage(e));
      }
      throw e;
    }
  }

  async login(dto: LoginDto): Promise<{
    accessToken: string;
    user: { id: number; username: string; email: string };
  }> {
    const user = await this.findByAccount(dto.username);
    if (!user) {
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    const matched = await bcrypt.compare(dto.password, user.password);
    if (!matched) {
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    const accessToken = this.jwtService.sign({
      sub: user.id,
      username: user.username,
      email: user.email,
    });
    return {
      accessToken,
      user: { id: user.id, username: user.username, email: user.email },
    };
  }

  private findByAccount(account: string): Promise<User | null> {
    const identifier = account.trim();
    if (identifier.includes('@')) {
      return this.userRepo.findOne({
        where: { email: identifier.toLowerCase() },
      });
    }
    return this.userRepo.findOne({ where: { username: identifier } });
  }

  async logout(token: string): Promise<void> {
    const payload = this.jwtService.decode(token);
    if (!token || !payload || typeof payload !== 'object' || !payload.exp) {
      throw new UnauthorizedException();
    }

    const tokenHash = this.hashToken(token);
    const existing = await this.revokedRepo.findOne({ where: { tokenHash } });
    if (existing) {
      return;
    }

    await this.revokedRepo.save(
      this.revokedRepo.create({
        tokenHash,
        expiresAt: new Date(payload.exp * 1000),
      }),
    );
  }

  async isRevoked(token: string): Promise<boolean> {
    if (!token) {
      return true;
    }
    const tokenHash = this.hashToken(token);
    const row = await this.revokedRepo.findOne({ where: { tokenHash } });
    return Boolean(row);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private isDuplicateEntry(error: unknown): boolean {
    const record = this.asErrorRecord(error);
    return (
      record.code === 'ER_DUP_ENTRY' ||
      record.driverError?.code === 'ER_DUP_ENTRY'
    );
  }

  private duplicateConflictMessage(error: unknown): string {
    const record = this.asErrorRecord(error);
    const msg = [
      record.sqlMessage,
      record.message,
      record.driverError?.sqlMessage,
      record.driverError?.message,
    ]
      .filter(Boolean)
      .join(' ');
    if (/uk_user_email|\bemail\b/i.test(msg)) {
      return '邮箱已存在';
    }
    return '用户名已存在';
  }

  private asErrorRecord(error: unknown): {
    code?: string;
    message?: string;
    sqlMessage?: string;
    driverError?: { code?: string; sqlMessage?: string; message?: string };
  } {
    if (!error || typeof error !== 'object') {
      return {};
    }
    return error as {
      code?: string;
      message?: string;
      sqlMessage?: string;
      driverError?: { code?: string; sqlMessage?: string; message?: string };
    };
  }
}
