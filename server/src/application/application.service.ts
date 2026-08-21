import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppForm } from './app-form.entity';
import { AppGroup } from './app-group.entity';
import { Application } from './application.entity';
import { CreateApplicationDto } from './dto/create-application.dto';
import { CreateFormDto } from './dto/create-form.dto';
import { NameDto } from './dto/name.dto';

const ICON_COLORS = [
  '#E8A317',
  '#2F6BFF',
  '#7B61FF',
  '#3DB8F5',
  '#12B5A0',
  '#F25C54',
];

@Injectable()
export class ApplicationService {
  constructor(
    @InjectRepository(Application)
    private readonly appRepo: Repository<Application>,
    @InjectRepository(AppGroup)
    private readonly groupRepo: Repository<AppGroup>,
    @InjectRepository(AppForm)
    private readonly formRepo: Repository<AppForm>,
  ) {}

  async list(ownerId: number): Promise<{ id: number; name: string; icon: string }[]> {
    const rows = await this.appRepo.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toAppItem(row));
  }

  async create(
    ownerId: number,
    dto: CreateApplicationDto,
  ): Promise<{ id: number; name: string; icon: string }> {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('请输入应用名称');
    }

    const saved = await this.appRepo.save(
      this.appRepo.create({
        name,
        icon: this.pickIcon(name),
        ownerId,
      }),
    );
    return this.toAppItem(saved);
  }

  async getOne(
    ownerId: number,
    id: number,
  ): Promise<{ id: number; name: string; icon: string }> {
    const app = await this.requireOwnedApp(ownerId, id);
    return this.toAppItem(app);
  }

  async getForm(ownerId: number, appId: number, formId: number) {
    await this.requireOwnedApp(ownerId, appId);
    const form = await this.requireForm(appId, formId);
    return this.toFormItem(form);
  }

  async directory(ownerId: number, id: number) {
    await this.requireOwnedApp(ownerId, id);
    const groups = await this.groupRepo.find({
      where: { applicationId: id },
      order: { createdAt: 'DESC' },
    });
    const forms = await this.formRepo.find({
      where: { applicationId: id },
      order: { createdAt: 'DESC' },
    });

    const formsByGroup = new Map<
      number,
      { id: number; name: string; groupId: number | null }[]
    >();
    const rootForms: { id: number; name: string; groupId: number | null }[] = [];
    for (const form of forms) {
      const item = this.toFormItem(form);
      if (form.groupId == null) {
        rootForms.push(item);
        continue;
      }
      const list = formsByGroup.get(form.groupId) ?? [];
      list.push(item);
      formsByGroup.set(form.groupId, list);
    }

    return {
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        forms: formsByGroup.get(group.id) ?? [],
      })),
      forms: rootForms,
    };
  }

  async createGroup(ownerId: number, appId: number, dto: NameDto) {
    await this.requireOwnedApp(ownerId, appId);
    const saved = await this.groupRepo.save(
      this.groupRepo.create({
        applicationId: appId,
        name: this.requireName(dto.name),
      }),
    );
    return { id: saved.id, name: saved.name };
  }

  async renameGroup(
    ownerId: number,
    appId: number,
    groupId: number,
    dto: NameDto,
  ) {
    await this.requireOwnedApp(ownerId, appId);
    const group = await this.requireGroup(appId, groupId);
    group.name = this.requireName(dto.name);
    const saved = await this.groupRepo.save(group);
    return { id: saved.id, name: saved.name };
  }

  async deleteGroup(ownerId: number, appId: number, groupId: number) {
    await this.requireOwnedApp(ownerId, appId);
    const group = await this.requireGroup(appId, groupId);
    const formCount = await this.formRepo.count({
      where: { applicationId: appId, groupId },
    });
    if (formCount > 0) {
      throw new BadRequestException('请先删除分组内的表单');
    }
    await this.groupRepo.remove(group);
  }

  async createForm(ownerId: number, appId: number, dto: CreateFormDto) {
    await this.requireOwnedApp(ownerId, appId);
    const groupId = dto.groupId ?? null;
    if (groupId != null) {
      const group = await this.groupRepo.findOne({
        where: { id: groupId, applicationId: appId },
      });
      if (!group) {
        throw new BadRequestException('分组不存在');
      }
    }
    const saved = await this.formRepo.save(
      this.formRepo.create({
        applicationId: appId,
        groupId,
        name: this.requireName(dto.name),
      }),
    );
    return this.toFormItem(saved);
  }

  async renameForm(
    ownerId: number,
    appId: number,
    formId: number,
    dto: NameDto,
  ) {
    await this.requireOwnedApp(ownerId, appId);
    const form = await this.requireForm(appId, formId);
    form.name = this.requireName(dto.name);
    const saved = await this.formRepo.save(form);
    return this.toFormItem(saved);
  }

  async deleteForm(ownerId: number, appId: number, formId: number) {
    await this.requireOwnedApp(ownerId, appId);
    const form = await this.requireForm(appId, formId);
    await this.formRepo.remove(form);
  }

  private async requireOwnedApp(ownerId: number, id: number) {
    const app = await this.appRepo.findOne({ where: { id, ownerId } });
    if (!app) {
      throw new NotFoundException('应用不存在');
    }
    return app;
  }

  private async requireGroup(applicationId: number, groupId: number) {
    const group = await this.groupRepo.findOne({
      where: { id: groupId, applicationId },
    });
    if (!group) {
      throw new NotFoundException('分组不存在');
    }
    return group;
  }

  private async requireForm(applicationId: number, formId: number) {
    const form = await this.formRepo.findOne({
      where: { id: formId, applicationId },
    });
    if (!form) {
      throw new NotFoundException('表单不存在');
    }
    return form;
  }

  private requireName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('请输入名称');
    }
    return trimmed;
  }

  private toAppItem(row: Application): { id: number; name: string; icon: string } {
    return { id: row.id, name: row.name, icon: row.icon };
  }

  private toFormItem(row: AppForm): {
    id: number;
    name: string;
    groupId: number | null;
  } {
    return { id: row.id, name: row.name, groupId: row.groupId };
  }

  private pickIcon(name: string): string {
    let hash = 0;
    for (const ch of name) {
      hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    }
    return ICON_COLORS[Math.abs(hash) % ICON_COLORS.length];
  }
}
