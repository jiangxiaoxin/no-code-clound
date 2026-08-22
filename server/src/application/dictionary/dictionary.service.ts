import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Like, Not, Repository } from 'typeorm';
import { Application } from '../application.entity';
import { CreateDictionaryDto } from './dto/create-dictionary.dto';
import { DictionaryItemInputDto } from './dto/dictionary-item-input.dto';
import { ListDictionaryDto } from './dto/list-dictionary.dto';
import { UpdateDictionaryDto } from './dto/update-dictionary.dto';
import { DictionaryItem } from './dictionary-item.entity';
import { Dictionary } from './dictionary.entity';

export type DictionaryListItem = {
  id: number;
  applicationId: number;
  name: string;
  code: string;
  description: string;
  status: 'active' | 'disabled';
  itemCount: number;
};

export type DictionaryItemView = {
  id: number;
  label: string;
  value: string;
  sortOrder: number;
  status: 'active' | 'disabled';
};

export type DictionaryDetail = DictionaryListItem & {
  items: DictionaryItemView[];
};

type NormalizedItem = {
  label: string;
  value: string;
  sortOrder: number;
  status: 'active' | 'disabled';
};

@Injectable()
export class DictionaryService {
  constructor(
    @InjectRepository(Application)
    private readonly appRepo: Repository<Application>,
    @InjectRepository(Dictionary)
    private readonly dictRepo: Repository<Dictionary>,
    @InjectRepository(DictionaryItem)
    private readonly itemRepo: Repository<DictionaryItem>,
    private readonly dataSource: DataSource,
  ) {}

  async list(
    ownerId: number,
    appId: number,
    query: ListDictionaryDto,
  ): Promise<{
    items: DictionaryListItem[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    await this.requireOwnedApp(ownerId, appId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim();
    const status = query.status;
    const [rows, total] = await this.dictRepo.findAndCount({
      where: keyword
        ? [
            {
              applicationId: appId,
              name: Like(`%${keyword}%`),
              ...(status ? { status } : {}),
            },
            {
              applicationId: appId,
              code: Like(`%${keyword}%`),
              ...(status ? { status } : {}),
            },
          ]
        : { applicationId: appId, ...(status ? { status } : {}) },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      items: await Promise.all(
        rows.map(async (row) =>
          this.toListItem(
            row,
            await this.itemRepo.count({ where: { dictionaryId: row.id } }),
          ),
        ),
      ),
      total,
      page,
      pageSize,
    };
  }

  async getOne(
    ownerId: number,
    appId: number,
    id: number,
  ): Promise<DictionaryDetail> {
    await this.requireOwnedApp(ownerId, appId);
    const dict = await this.requireDict(appId, id);
    return this.toDetail(dict);
  }

  async create(
    ownerId: number,
    appId: number,
    dto: CreateDictionaryDto,
  ): Promise<DictionaryDetail> {
    await this.requireOwnedApp(ownerId, appId);
    const name = this.requireName(dto.name);
    const code = dto.code.trim();
    this.assertCode(code);
    await this.assertNameUnique(appId, name);
    await this.assertCodeUnique(appId, code);
    const items = this.normalizeItems(dto.items);

    const saved = await this.dataSource.transaction(async (manager) => {
      const dict = await manager.save(
        Dictionary,
        manager.create(Dictionary, {
          applicationId: appId,
          name,
          code,
          description: dto.description?.trim() ?? '',
          status: 'active',
        }),
      );
      let savedItems: DictionaryItem[] = [];
      if (items.length) {
        savedItems = await manager.save(
          DictionaryItem,
          items.map((item) =>
            manager.create(DictionaryItem, {
              ...item,
              dictionaryId: dict.id,
            }),
          ),
        );
      }
      return { dict, items: savedItems };
    });
    return this.toDetail(saved.dict, saved.items);
  }

  async update(
    ownerId: number,
    appId: number,
    id: number,
    dto: UpdateDictionaryDto,
  ): Promise<DictionaryDetail> {
    await this.requireOwnedApp(ownerId, appId);
    const dict = await this.requireDict(appId, id);
    const name = dto.name === undefined ? dict.name : this.requireName(dto.name);
    if (name !== dict.name) {
      await this.assertNameUnique(appId, name, id);
    }
    const items =
      dto.items === undefined ? undefined : this.normalizeItems(dto.items);

    const saved = await this.dataSource.transaction(async (manager) => {
      const next = await manager.save(
        Dictionary,
        manager.create(Dictionary, {
          ...dict,
          name,
          code: dict.code,
          description:
            dto.description === undefined
              ? dict.description
              : dto.description.trim(),
          status: dto.status ?? dict.status,
        }),
      );
      if (items) {
        await manager.delete(DictionaryItem, { dictionaryId: id });
        if (items.length) {
          await manager.save(
            DictionaryItem,
            items.map((item) =>
              manager.create(DictionaryItem, {
                ...item,
                dictionaryId: id,
              }),
            ),
          );
        }
      }
      return next;
    });
    return this.toDetail(saved);
  }

  async delete(ownerId: number, appId: number, id: number): Promise<void> {
    await this.requireOwnedApp(ownerId, appId);
    await this.requireDict(appId, id);
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(DictionaryItem, { dictionaryId: id });
      await manager.delete(Dictionary, { id });
    });
  }

  async options(
    ownerId: number,
    appId: number,
  ): Promise<{ id: number; name: string; code: string }[]> {
    await this.requireOwnedApp(ownerId, appId);
    const rows = await this.dictRepo.find({
      where: { applicationId: appId, status: 'active' },
      order: { name: 'ASC' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
    }));
  }

  async listEnabledItemsByCode(
    ownerId: number,
    appId: number,
    code: string,
  ): Promise<{ label: string; value: string }[]> {
    const [row] = await this.listEnabledItemsByCodes(ownerId, appId, [code]);
    return row?.items ?? [];
  }

  async listEnabledItemsByCodes(
    ownerId: number,
    appId: number,
    codes: string[],
  ): Promise<{ code: string; items: { label: string; value: string }[] }[]> {
    await this.requireOwnedApp(ownerId, appId);
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const raw of codes) {
      const code = typeof raw === 'string' ? raw.trim() : '';
      if (!code || seen.has(code)) {
        continue;
      }
      seen.add(code);
      unique.push(code);
    }
    if (!unique.length) {
      return [];
    }

    const dicts = await this.dictRepo.find({
      where: { applicationId: appId, code: In(unique) },
    });
    const dictByCode = new Map(dicts.map((row) => [row.code, row]));
    const ids = dicts.map((row) => row.id);
    const items = ids.length
      ? await this.itemRepo.find({
          where: { dictionaryId: In(ids), status: 'active' },
          order: { sortOrder: 'ASC', id: 'ASC' },
        })
      : [];
    const itemsByDictId = new Map<number, { label: string; value: string }[]>();
    for (const item of items) {
      const list = itemsByDictId.get(item.dictionaryId) ?? [];
      list.push({ label: item.label, value: item.value });
      itemsByDictId.set(item.dictionaryId, list);
    }

    return unique.map((code) => {
      const dict = dictByCode.get(code);
      return {
        code,
        items: dict ? (itemsByDictId.get(dict.id) ?? []) : [],
      };
    });
  }

  private async requireOwnedApp(ownerId: number, id: number) {
    const app = await this.appRepo.findOne({ where: { id, ownerId } });
    if (!app) {
      throw new NotFoundException('应用不存在');
    }
    return app;
  }

  private async requireDict(applicationId: number, id: number) {
    const dict = await this.dictRepo.findOne({
      where: { id, applicationId },
    });
    if (!dict) {
      throw new NotFoundException('字典不存在');
    }
    return dict;
  }

  private requireName(name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 32) {
      throw new BadRequestException('字典名称须为 1–32 个字');
    }
    return trimmed;
  }

  private assertCode(code: string) {
    if (!/^[a-z0-9_]{2,64}$/.test(code)) {
      throw new BadRequestException(
        '字典编码须为 2–64 位小写字母、数字或下划线',
      );
    }
  }

  private async assertNameUnique(
    applicationId: number,
    name: string,
    excludeId?: number,
  ) {
    const existing = await this.dictRepo.findOne({
      where: {
        applicationId,
        name,
        ...(excludeId ? { id: Not(excludeId) } : {}),
      },
    });
    if (existing) {
      throw new ConflictException('同一应用内字典名称已存在');
    }
  }

  private async assertCodeUnique(
    applicationId: number,
    code: string,
    excludeId?: number,
  ) {
    const existing = await this.dictRepo.findOne({
      where: {
        applicationId,
        code,
        ...(excludeId ? { id: Not(excludeId) } : {}),
      },
    });
    if (existing) {
      throw new ConflictException('同一应用内字典编码已存在');
    }
  }

  private normalizeItems(items: DictionaryItemInputDto[]): NormalizedItem[] {
    const seen = new Set<string>();
    return items.map((raw) => {
      const label = raw.label.trim();
      const value = raw.value.trim();
      if (!label || label.length > 64) {
        throw new BadRequestException('字典项名称须为 1–64 个字');
      }
      if (!value || value.length > 64) {
        throw new BadRequestException('字典项值须为 1–64 个字');
      }
      if (seen.has(value)) {
        throw new BadRequestException('同一请求里选项值不能重复');
      }
      seen.add(value);
      return {
        label,
        value,
        sortOrder: raw.sortOrder ?? 0,
        status: raw.status ?? 'active',
      };
    });
  }

  private toListItem(row: Dictionary, itemCount: number): DictionaryListItem {
    return {
      id: row.id,
      applicationId: row.applicationId,
      name: row.name,
      code: row.code,
      description: row.description,
      status: row.status,
      itemCount,
    };
  }

  private async toDetail(
    row: Dictionary,
    items?: DictionaryItem[],
  ): Promise<DictionaryDetail> {
    const resolved =
      items ??
      (await this.itemRepo.find({
        where: { dictionaryId: row.id },
        order: { sortOrder: 'ASC', id: 'ASC' },
      }));
    const views = resolved.map((item) => ({
      id: item.id,
      label: item.label,
      value: item.value,
      sortOrder: item.sortOrder,
      status: item.status,
    }));
    return {
      ...this.toListItem(row, views.length),
      items: views,
    };
  }
}
