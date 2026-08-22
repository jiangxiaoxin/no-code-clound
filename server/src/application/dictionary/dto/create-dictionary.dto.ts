import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { DictionaryItemInputDto } from './dictionary-item-input.dto';

export class CreateDictionaryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 32, { message: '字典名称须为 1–32 个字' })
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[a-z0-9_]{2,64}$/, {
    message: '字典编码须为 2–64 位小写字母、数字或下划线',
  })
  code: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 255)
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DictionaryItemInputDto)
  items: DictionaryItemInputDto[];
}
