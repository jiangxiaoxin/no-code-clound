import { IsObject } from 'class-validator';

export class InstanceDataDto {
  @IsObject({ message: '请提交表单数据' })
  data: Record<string, unknown>;
}
