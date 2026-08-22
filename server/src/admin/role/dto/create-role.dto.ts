import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateRoleDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 32, { message: '角色名称须为 1–32 个字' })
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[a-z0-9_]{2,64}$/, {
    message: '角色代码须为 2–64 位小写字母、数字或下划线',
  })
  code: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 255)
  description?: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionCodes: string[];
}
