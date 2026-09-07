import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class CopyVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fromVersionId: number;
}
