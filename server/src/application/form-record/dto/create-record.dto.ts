import { IsIn, IsObject, IsOptional } from 'class-validator';

export class CreateRecordDto {
  @IsObject({ message: '请提交记录数据' })
  data: Record<string, unknown>;

  @IsOptional()
  @IsIn(['draft', 'submit'])
  intent?: 'draft' | 'submit';
}
