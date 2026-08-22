import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { In, Repository } from 'typeorm';
import { AuthPrincipal } from '../admin/permissions';
import { UserDepartment } from '../admin/department/user-department.entity';
import { RolePermission } from '../admin/role/role-permission.entity';
import { Role } from '../admin/role/role.entity';
import { UserRole } from '../admin/role/user-role.entity';
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
    @InjectRepository(UserDepartment)
    private readonly userDepartmentRepo: Repository<UserDepartment>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepo: Repository<RolePermission>,
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
        this.userRepo.create({
          username,
          email,
          password,
          displayName: username,
          status: 'active',
        }),
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
    user: AuthPrincipal;
  }> {
    const user = await this.findByAccount(dto.username);
    if (!user) {
      throw new UnauthorizedException(LOGIN_FAILED);
    }
    if (user.status === 'disabled') {
      throw new UnauthorizedException('账号已停用');
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
      user: await this.getPrincipal(user.id),
    };
  }

  async getPrincipal(userId: number): Promise<AuthPrincipal> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.status === 'disabled') {
      throw new UnauthorizedException('账号已停用');
    }

    const userDepts = await this.userDepartmentRepo.find({ where: { userId } });
    const departmentIds = [
      ...new Set(userDepts.map((row) => row.departmentId)),
    ].sort((a, b) => a - b);

    const userRoles = await this.userRoleRepo.find({ where: { userId } });
    const roleIds = userRoles.map((row) => row.roleId);
    const roles =
      roleIds.length === 0
        ? []
        : await this.roleRepo.find({
            where: { id: In(roleIds), status: 'active' },
          });
    const roleCodes = [...new Set(roles.map((role) => role.code))].sort();

    const permissions =
      roles.length === 0
        ? []
        : [
            ...new Set(
              (
                await this.rolePermissionRepo.find({
                  where: { roleId: In(roles.map((role) => role.id)) },
                })
              ).map((row) => row.permission),
            ),
          ].sort();

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      status: 'active',
      departmentIds,
      roleCodes,
      permissions,
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
