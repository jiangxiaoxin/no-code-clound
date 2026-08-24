import { IsObject } from 'class-validator';

export class PatchRecordDto {
  @IsObject({ message: '请提交记录数据' })
  data: Record<string, unknown>;
}
