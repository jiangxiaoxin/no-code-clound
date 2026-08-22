import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsInt,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAdminUserDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[A-Za-z0-9_]{3,32}$/, {
    message: '用户名须为 3–32 位字母、数字或下划线',
  })
  username: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 64, { message: '姓名须为 1–64 个字' })
  displayName: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: '请输入有效邮箱' })
  @MaxLength(255, { message: '邮箱过长' })
  email: string;

  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(72, { message: '密码最多 72 位' })
  password: string;

  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  departmentIds: number[];

  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  roleIds: number[];
}
