import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class AddSignTaskDto {
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  assigneeIds: number[];

  @IsOptional()
  @IsString()
  comment?: string;
}
