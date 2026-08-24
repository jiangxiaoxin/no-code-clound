import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ListFormFieldsDto {
  @IsOptional()
  @Transform(({ value }) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  })
  @IsInt()
  @Min(1)
  excludeFormId?: number;
}
