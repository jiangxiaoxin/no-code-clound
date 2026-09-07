import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { WorkflowRenderService } from './workflow-render.service';

// 上传接口的鉴权必须发生在 multer 落盘之前：放 handler 里文件已经写进磁盘了
@Injectable()
export class RenderUploadGuard implements CanActivate {
  constructor(private readonly render: WorkflowRenderService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      params: { instanceId?: string };
      query: { fieldKey?: string };
      user: { id: number };
    }>();
    const instanceId = Number(req.params?.instanceId);
    if (!Number.isInteger(instanceId)) {
      throw new BadRequestException('实例不存在');
    }
    const fieldKey = String(req.query?.fieldKey || '');
    if (!fieldKey) {
      throw new BadRequestException('请指定字段');
    }
    await this.render.assertWritable(instanceId, req.user.id, fieldKey);
    return true;
  }
}
