import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { AppAccessService } from './app-access.service';

// 上传接口的鉴权必须发生在 multer 落盘之前：放 handler 里文件已经写进磁盘了
@Injectable()
export class AppUploadGuard implements CanActivate {
  constructor(private readonly access: AppAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      params: { id?: string };
      user: { id: number };
    }>();
    const appId = Number(req.params?.id);
    if (!Number.isInteger(appId)) {
      throw new BadRequestException('应用不存在');
    }
    await this.access.requireUse(req.user.id, appId);
    return true;
  }
}
