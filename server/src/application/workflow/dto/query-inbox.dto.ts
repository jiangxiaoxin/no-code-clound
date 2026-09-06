import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryInboxDto {
  @IsIn(['todo', 'mine', 'done'])
  kind: 'todo' | 'mine' | 'done';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  appId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '分页大小不正确' })
  @Min(1, { message: '分页大小不正确' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '分页大小不正确' })
  @Min(1, { message: '分页大小不正确' })
  @Max(100, { message: '分页大小不正确' })
  pageSize?: number;
}
