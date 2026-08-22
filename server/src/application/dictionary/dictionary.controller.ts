import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CreateDictionaryDto } from './dto/create-dictionary.dto';
import { ItemsByCodesDto } from './dto/items-by-codes.dto';
import { ListDictionaryDto } from './dto/list-dictionary.dto';
import { UpdateDictionaryDto } from './dto/update-dictionary.dto';
import { DictionaryService } from './dictionary.service';

@Controller('apps/:appId/dictionaries')
@UseGuards(JwtAuthGuard)
export class DictionaryController {
  constructor(private readonly dictionaryService: DictionaryService) {}

  @Get()
  list(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Query() query: ListDictionaryDto,
  ) {
    return this.dictionaryService.list(req.user.id, appId, query);
  }

  @Get('options')
  options(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
  ) {
    return this.dictionaryService.options(req.user.id, appId);
  }

  @Post('items-by-codes')
  @HttpCode(200)
  listEnabledItemsByCodes(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Body() dto: ItemsByCodesDto,
  ) {
    return this.dictionaryService.listEnabledItemsByCodes(
      req.user.id,
      appId,
      dto.codes,
    );
  }

  @Get('by-code/:code/items')
  listEnabledItemsByCode(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('code') code: string,
  ) {
    return this.dictionaryService.listEnabledItemsByCode(
      req.user.id,
      appId,
      code,
    );
  }

  @Get(':id')
  getOne(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.dictionaryService.getOne(req.user.id, appId, id);
  }

  @Post()
  @HttpCode(201)
  create(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Body() dto: CreateDictionaryDto,
  ) {
    return this.dictionaryService.create(req.user.id, appId, dto);
  }

  @Patch(':id')
  update(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDictionaryDto,
  ) {
    return this.dictionaryService.update(req.user.id, appId, id, dto);
  }

  @Delete(':id')
  remove(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.dictionaryService.delete(req.user.id, appId, id);
  }
}
