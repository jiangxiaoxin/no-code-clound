import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryRecordsDto {
  @IsOptional()
  @IsArray()
  filters?: { key: string; op: string; value: unknown }[];

  @IsOptional()
  @IsIn(['all', 'any'])
  match?: 'all' | 'any';

  @IsOptional()
  sort?: { key: string; order?: string } | { key: string; order?: string }[];

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
