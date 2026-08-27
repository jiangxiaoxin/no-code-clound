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
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CreateRecordDto } from './dto/create-record.dto';
import { PatchRecordDto } from './dto/patch-record.dto';
import { QueryRecordsDto } from './dto/query-records.dto';
import { MAX_IMPORT_FILE_SIZE } from './form-record.import';
import { FormRecordService } from './form-record.service';

@Controller('apps/:appId/forms/:formId/records')
@UseGuards(JwtAuthGuard)
export class FormRecordController {
  constructor(private readonly formRecordService: FormRecordService) {}

  @Post()
  @HttpCode(201)
  create(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Body() dto: CreateRecordDto,
  ) {
    return this.formRecordService.create(req.user.id, appId, formId, dto.data);
  }

  @Post('query')
  query(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Body() dto: QueryRecordsDto,
  ) {
    return this.formRecordService.query(req.user.id, appId, formId, dto);
  }

  @Get('import-template')
  async importTemplate(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
  ) {
    const { buffer, filename } = await this.formRecordService.buildImportTemplate(
      req.user.id,
      appId,
      formId,
    );
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
  }

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_SIZE } }),
  )
  importExcel(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @UploadedFile() file?: { buffer: Buffer; size: number; originalname: string },
  ) {
    return this.formRecordService.importFromExcel(
      req.user.id,
      appId,
      formId,
      file,
    );
  }

  @Get(':recordId')
  getOne(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Param('recordId') recordId: string,
  ) {
    return this.formRecordService.getOne(req.user.id, appId, formId, recordId);
  }

  @Patch(':recordId')
  update(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Param('recordId') recordId: string,
    @Body() dto: PatchRecordDto,
  ) {
    return this.formRecordService.update(
      req.user.id,
      appId,
      formId,
      recordId,
      dto.data,
    );
  }

  @Delete(':recordId')
  remove(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Param('recordId') recordId: string,
  ) {
    return this.formRecordService.remove(req.user.id, appId, formId, recordId);
  }
}
