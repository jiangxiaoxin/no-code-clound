import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { join, relative, sep } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AppUploadGuard } from './access/app-upload.guard';
import { ApplicationService } from './application.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ConvertFormKindDto } from './dto/convert-form-kind.dto';
import { CreateFormDto } from './dto/create-form.dto';
import { ListFormFieldsDto } from './dto/list-form-fields.dto';
import { NameDto } from './dto/name.dto';
import { SaveFormFieldsDto } from './dto/save-form-fields.dto';
import { SaveFormConfigDto } from './dto/save-form-config.dto';
import { originalUploadName } from './upload-filename';

const UPLOAD_DIR = join(process.cwd(), 'uploads');
const IMAGE_UPLOAD_DIR = join(UPLOAD_DIR, 'imgs');
const FILE_UPLOAD_DIR = join(UPLOAD_DIR, 'files');
const MAX_IMAGE_SIZE = 50 * 1024 * 1024;
const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};
const FILE_FORMATS: { exts: string[]; mimes: string[] }[] = [
  { exts: ['.pdf'], mimes: ['application/pdf'] },
  {
    exts: ['.doc', '.docx'],
    mimes: [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
  {
    exts: ['.xls', '.xlsx'],
    mimes: [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  {
    exts: ['.ppt', '.pptx'],
    mimes: [
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
  },
  { exts: ['.txt'], mimes: ['text/plain'] },
  {
    exts: ['.zip'],
    mimes: ['application/zip', 'application/x-zip-compressed'],
  },
];

function localDateFolder() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function ensureImageUploadDir() {
  const dir = join(IMAGE_UPLOAD_DIR, localDateFolder());
  mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureFileUploadDir() {
  const dir = join(FILE_UPLOAD_DIR, localDateFolder());
  mkdirSync(dir, { recursive: true });
  return dir;
}

function publicUploadUrl(filePath: string) {
  return `/uploads/${relative(UPLOAD_DIR, filePath).split(sep).join('/')}`;
}

function uploadFileExt(name: string) {
  const base = String(name || '').split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot < 0) return '';
  return base.slice(dot).toLowerCase();
}

function isAllowedUploadFile(file: { originalname?: string; mimetype?: string }) {
  const ext = uploadFileExt(file.originalname || '');
  if (!ext) return false;
  const format = FILE_FORMATS.find((item) => item.exts.includes(ext));
  if (!format) return false;
  const mime = String(file.mimetype || '').trim().toLowerCase();
  if (!mime || mime === 'application/octet-stream') return true;
  return format.mimes.includes(mime);
}

@Controller('apps')
@UseGuards(JwtAuthGuard)
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Get()
  list(@Req() req: { user: { id: number } }) {
    return this.applicationService.list(req.user.id);
  }

  @Post()
  @HttpCode(201)
  create(
    @Req() req: { user: { id: number } },
    @Body() dto: CreateApplicationDto,
  ) {
    return this.applicationService.create(req.user.id, dto);
  }

  @Get(':id')
  getOne(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.applicationService.getOne(req.user.id, id);
  }

  @Patch(':id')
  renameApp(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NameDto,
  ) {
    return this.applicationService.renameApp(req.user.id, id, dto);
  }

  @Delete(':id')
  deleteApp(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.applicationService.deleteApp(req.user.id, id);
  }

  @Get(':id/directory')
  directory(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.applicationService.directory(req.user.id, id);
  }

  @Post(':id/groups')
  @HttpCode(201)
  createGroup(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NameDto,
  ) {
    return this.applicationService.createGroup(req.user.id, id, dto);
  }

  @Patch(':id/groups/:groupId')
  renameGroup(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() dto: NameDto,
  ) {
    return this.applicationService.renameGroup(req.user.id, id, groupId, dto);
  }

  @Delete(':id/groups/:groupId')
  deleteGroup(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Param('groupId', ParseIntPipe) groupId: number,
  ) {
    return this.applicationService.deleteGroup(req.user.id, id, groupId);
  }

  @Get(':id/form-fields')
  listFormFields(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListFormFieldsDto,
  ) {
    return this.applicationService.listFormFields(
      req.user.id,
      id,
      query.excludeFormId,
      query.include,
    );
  }

  @Get(':id/forms/:formId')
  getForm(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Param('formId', ParseIntPipe) formId: number,
  ) {
    return this.applicationService.getForm(req.user.id, id, formId);
  }

  @Put(':id/forms/:formId/fields')
  saveFields(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Body() dto: SaveFormFieldsDto,
  ) {
    return this.applicationService.saveFields(
      req.user.id,
      id,
      formId,
      dto.fields,
      dto.columns,
    );
  }

  @Get(':id/forms/:formId/config')
  getFormConfig(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Param('formId', ParseIntPipe) formId: number,
  ) {
    return this.applicationService.getFormConfig(req.user.id, id, formId);
  }

  @Patch(':id/forms/:formId/config')
  saveFormConfig(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Body() dto: SaveFormConfigDto,
  ) {
    return this.applicationService.saveFormConfig(
      req.user.id,
      id,
      formId,
      dto.config,
    );
  }

  @Post(':id/forms')
  @HttpCode(201)
  createForm(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateFormDto,
  ) {
    return this.applicationService.createForm(req.user.id, id, dto);
  }

  @Patch(':id/forms/:formId/kind')
  convertFormKind(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Body() dto: ConvertFormKindDto,
  ) {
    return this.applicationService.convertFormKind(
      req.user.id,
      id,
      formId,
      dto,
    );
  }

  @Patch(':id/forms/:formId')
  renameForm(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Body() dto: NameDto,
  ) {
    return this.applicationService.renameForm(req.user.id, id, formId, dto);
  }

  @Delete(':id/forms/:formId')
  deleteForm(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Param('formId', ParseIntPipe) formId: number,
  ) {
    return this.applicationService.deleteForm(req.user.id, id, formId);
  }

  @Post(':id/uploads')
  @UseGuards(AppUploadGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, ensureImageUploadDir());
        },
        filename: (_req, file, cb) => {
          const ext = IMAGE_EXT[file.mimetype] || '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_IMAGE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!IMAGE_EXT[file.mimetype]) {
          cb(new BadRequestException('只支持 jpg、png、gif、webp 图片'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file?: { filename: string; path: string },
  ) {
    if (!file?.filename || !file.path) {
      throw new BadRequestException('请选择图片');
    }
    return { url: publicUploadUrl(file.path) };
  }

  @Post(':id/file-uploads')
  @UseGuards(AppUploadGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, ensureFileUploadDir());
        },
        filename: (_req, file, cb) => {
          const ext = uploadFileExt(file.originalname) || '';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_IMAGE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!isAllowedUploadFile(file)) {
          cb(new BadRequestException('不支持该文件格式'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadFile(
    @UploadedFile()
    file?: { filename: string; path: string; originalname?: string },
  ) {
    if (!file?.filename || !file.path) {
      throw new BadRequestException('请选择文件');
    }
    return {
      url: publicUploadUrl(file.path),
      name: originalUploadName(file),
    };
  }
}
