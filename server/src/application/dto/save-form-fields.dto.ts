import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional } from 'class-validator';

export class SaveFormFieldsDto {
  @IsArray({ message: '请提交字段列表' })
  fields: Record<string, unknown>[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3, 4])
  columns?: number;
}
