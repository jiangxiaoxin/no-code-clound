import { IsBoolean } from 'class-validator';

export class PatchEnabledDto {
  @IsBoolean({ message: '请指定是否启用流程' })
  enabled: boolean;
}
