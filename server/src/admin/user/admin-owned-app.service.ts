import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthPrincipal } from '../permissions';
import { User } from '../../user/user.entity';
import { Application } from '../../application/application.entity';
import { AppAccessAdminService } from '../../application/access/app-access-admin.service';

@Injectable()
export class AdminOwnedAppService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Application)
    private readonly appRepo: Repository<Application>,
    private readonly accessAdmin: AppAccessAdminService,
  ) {}

  async listOwnedApps(
    actor: AuthPrincipal,
    userId: number,
  ): Promise<{ id: number; name: string }[]> {
    this.assertSystemAdmin(actor);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('人员不存在');
    if (user.status !== 'disabled') return [];
    const rows = await this.appRepo.find({
      where: { ownerId: userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  async transferOwnedApp(
    actor: AuthPrincipal,
    userId: number,
    appId: number,
    toUserId: number,
  ): Promise<void> {
    this.assertSystemAdmin(actor);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.status !== 'disabled') {
      throw new NotFoundException('人员不存在');
    }
    const app = await this.appRepo.findOne({ where: { id: appId } });
    if (!app || app.ownerId !== userId) {
      throw new NotFoundException('应用不存在');
    }
    await this.accessAdmin.transferOwner(appId, userId, toUserId);
  }

  private assertSystemAdmin(actor: AuthPrincipal) {
    if (!actor.roleCodes?.includes('system_admin')) {
      throw new ForbiddenException('无权访问');
    }
  }
}
