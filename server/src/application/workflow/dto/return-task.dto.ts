import { IsString } from 'class-validator';

export class ReturnTaskDto {
  @IsString()
  comment: string;
}
