import { IsObject } from 'class-validator';

export class ResubmitTaskDto {
  @IsObject({ message: '请提交表单数据' })
  data: Record<string, unknown>;
}
