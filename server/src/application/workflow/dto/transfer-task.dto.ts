import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class TransferTaskDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeId: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
