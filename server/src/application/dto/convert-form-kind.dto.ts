import { IsIn } from 'class-validator';

export class ConvertFormKindDto {
  @IsIn(['workflow', 'normal'], { message: '请指定转为流程表单' })
  formKind: 'workflow' | 'normal';
}
