import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetUserPasswordDto {
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(72, { message: '密码最多 72 位' })
  newPassword: string;
}
