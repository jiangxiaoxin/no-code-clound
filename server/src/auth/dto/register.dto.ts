import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: '请输入有效邮箱' })
  @MaxLength(255, { message: '邮箱过长' })
  email: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[A-Za-z0-9_]{3,32}$/, {
    message: '用户名须为 3–32 位字母、数字或下划线',
  })
  username: string;

  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  password: string;
}
