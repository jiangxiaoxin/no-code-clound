import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
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
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { originalUploadName } from '../upload-filename';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { InstanceDataDto } from './dto/instance-data.dto';
import { QueryInboxDto } from './dto/query-inbox.dto';
import { WorkflowInboxService } from './workflow-inbox.service';
import { WorkflowInstanceService } from './workflow-instance.service';
import { WorkflowRenderService } from './workflow-render.service';

const UPLOAD_DIR = join(process.cwd(), 'uploads');
const FILE_UPLOAD_DIR = join(UPLOAD_DIR, 'files');

function localDateFolder() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function publicUploadUrl(filePath: string) {
  return `/uploads/${relative(UPLOAD_DIR, filePath).split(sep).join('/')}`;
}

@Controller('workflow')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(
    private readonly inbox: WorkflowInboxService,
    private readonly instances: WorkflowInstanceService,
    private readonly render: WorkflowRenderService,
  ) {}

  @Post('inbox/query')
  queryInbox(
    @Req() req: { user: { id: number } },
    @Body() dto: QueryInboxDto,
  ) {
    return this.inbox.query(req.user.id, dto);
  }

  @Get('inbox/count')
  countInbox(
    @Req() req: { user: { id: number } },
    @Query('appId') appId?: string,
  ) {
    const id = appId ? Number(appId) : undefined;
    return this.inbox.count(
      req.user.id,
      Number.isInteger(id) ? id : undefined,
    );
  }

  @Get('inbox/:kind/:id')
  openInbox(
    @Req() req: { user: { id: number } },
    @Param('kind') kind: 'todo' | 'mine' | 'done',
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.inbox.open(req.user.id, kind, id);
  }

  @Post('tasks/:taskId/complete')
  completeTask(
    @Req() req: { user: { id: number } },
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: CompleteTaskDto,
  ) {
    return this.instances.complete(taskId, req.user.id, dto);
  }

  @Post('instances/:instanceId/draft')
  saveDraft(
    @Req() req: { user: { id: number } },
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Body() dto: InstanceDataDto,
  ) {
    return this.instances.saveDraft(instanceId, req.user.id, dto.data);
  }

  @Post('instances/:instanceId/submit')
  submitInstance(
    @Req() req: { user: { id: number } },
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Body() dto: InstanceDataDto,
  ) {
    return this.instances.submit(instanceId, req.user.id, dto.data);
  }

  @Post('instances/:instanceId/cancel')
  cancelInstance(
    @Req() req: { user: { id: number } },
    @Param('instanceId', ParseIntPipe) instanceId: number,
  ) {
    return this.instances.cancel(instanceId, req.user.id);
  }

  @Post('instances/:instanceId/retry')
  retryInstance(
    @Req() req: { user: { id: number } },
    @Param('instanceId', ParseIntPipe) instanceId: number,
  ) {
    return this.instances.retry(instanceId, req.user.id);
  }

  @Post('render/:instanceId/source-records')
  sourceRecords(
    @Req() req: { user: { id: number } },
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Body()
    body: {
      fieldKey: string;
      filters?: { key: string; op: string; value: unknown }[];
      page?: number;
      pageSize?: number;
      keyword?: string;
    },
  ) {
    return this.render.sourceRecords(instanceId, req.user.id, body);
  }

  @Post('render/:instanceId/linkage')
  linkage(
    @Req() req: { user: { id: number } },
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Body() body: { fieldKey: string; conditions?: { key: string; op: string; value: unknown }[] },
  ) {
    return this.render.linkage(instanceId, req.user.id, body);
  }

  @Post('render/:instanceId/files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(FILE_UPLOAD_DIR, localDateFolder());
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const base = String(file.originalname || '').split(/[\\/]/).pop() || '';
          const dot = base.lastIndexOf('.');
          const ext = dot < 0 ? '' : base.slice(dot).toLowerCase();
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadFile(
    @Req() req: { user: { id: number } },
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Body('fieldKey') fieldKey: string,
    @UploadedFile()
    file?: { filename: string; path: string; originalname?: string },
  ) {
    if (!fieldKey) throw new BadRequestException('请指定字段');
    await this.render.assertWritable(instanceId, req.user.id, fieldKey);
    if (!file?.filename || !file.path) {
      throw new BadRequestException('请选择文件');
    }
    return {
      url: publicUploadUrl(file.path),
      name: originalUploadName(file),
    };
  }
}
