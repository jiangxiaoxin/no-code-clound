import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length } from 'class-validator';

export class DictionaryItemInputDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 64, { message: '字典项名称须为 1–64 个字' })
  label: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 64, { message: '字典项值须为 1–64 个字' })
  value: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
}
