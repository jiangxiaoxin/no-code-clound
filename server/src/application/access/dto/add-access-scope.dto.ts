import { Type } from 'class-transformer';
import { IsIn, IsInt, Min } from 'class-validator';
import type { AppAccessScopeType } from '../app-access-scope.entity';

export class AddAccessScopeDto {
  @IsIn(['user', 'department', 'role'])
  type: AppAccessScopeType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetId: number;
}
