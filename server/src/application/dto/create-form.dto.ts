import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { NameDto } from './name.dto';

export class CreateFormDto extends NameDto {
  @IsOptional()
  @Transform(({ value }) =>
    value === null || value === undefined || value === ''
      ? null
      : Number(value),
  )
  @IsInt()
  @Min(1)
  groupId?: number | null;
}
