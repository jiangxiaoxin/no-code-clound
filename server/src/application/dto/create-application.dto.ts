import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateApplicationDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: '请输入应用名称' })
  @MaxLength(32, { message: '应用名称最多 32 个字' })
  name: string;
}
