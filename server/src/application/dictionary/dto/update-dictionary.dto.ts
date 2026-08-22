import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { DictionaryItemInputDto } from './dictionary-item-input.dto';

export class UpdateDictionaryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 32, { message: '字典名称须为 1–32 个字' })
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 255)
  description?: string;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DictionaryItemInputDto)
  items?: DictionaryItemInputDto[];
}
