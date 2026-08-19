import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3, { message: '请输入用户名或邮箱' })
  @MaxLength(255, { message: '账号过长' })
  username: string;

  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  password: string;
}
