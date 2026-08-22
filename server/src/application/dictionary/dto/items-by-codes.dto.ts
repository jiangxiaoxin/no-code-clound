import { Transform } from 'class-transformer';
import { IsArray, IsString } from 'class-validator';

export class ItemsByCodesDto {
  @Transform(({ value }) => (Array.isArray(value) ? value : []))
  @IsArray()
  @IsString({ each: true })
  codes: string[];
}
