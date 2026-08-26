import { IsObject } from 'class-validator';

export class SaveFormConfigDto {
  @IsObject()
  config: Record<string, unknown>;
}
