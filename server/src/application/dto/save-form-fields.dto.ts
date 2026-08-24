import { IsArray } from 'class-validator';

export class SaveFormFieldsDto {
  @IsArray({ message: '请提交字段列表' })
  fields: Record<string, unknown>[];
}
