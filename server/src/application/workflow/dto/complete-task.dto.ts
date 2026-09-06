import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class CompleteTaskDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
