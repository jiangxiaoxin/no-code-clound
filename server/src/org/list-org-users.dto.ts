import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

function toPositiveIntIds(value: unknown): number[] | undefined {
  if (value == null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const out: number[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    const n = typeof item === 'number' ? item : Number(String(item).trim());
    if (!Number.isInteger(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export class ListOrgUsersDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roleId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @Transform(({ value }) => toPositiveIntIds(value))
  @IsArray()
  @IsInt({ each: true })
  ids?: number[];

  @IsOptional()
  @IsIn(['all', 'custom', 'dept_field'])
  memberScope?: 'all' | 'custom' | 'dept_field';

  @IsOptional()
  @Transform(({ value }) => toPositiveIntIds(value))
  @IsArray()
  @IsInt({ each: true })
  scopeDepartmentIds?: number[];

  @IsOptional()
  @Transform(({ value }) => toPositiveIntIds(value))
  @IsArray()
  @IsInt({ each: true })
  scopeRoleIds?: number[];

  @IsOptional()
  @Transform(({ value }) => toPositiveIntIds(value))
  @IsArray()
  @IsInt({ each: true })
  scopeUserIds?: number[];
}
