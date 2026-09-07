import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CopyVersionDto } from './dto/copy-version.dto';
import { SaveVersionDto } from './dto/save-version.dto';
import { WorkflowDefinitionService } from './workflow-definition.service';

@Controller('apps/:appId/forms/:formId/workflow')
@UseGuards(JwtAuthGuard)
export class AppWorkflowController {
  constructor(private readonly definition: WorkflowDefinitionService) {}

  @Get()
  get(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
  ) {
    return this.definition.get(req.user.id, appId, formId);
  }

  @Put('versions/:versionId')
  saveVersion(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @Body() dto: SaveVersionDto,
  ) {
    return this.definition.saveVersion(
      req.user.id,
      appId,
      formId,
      versionId,
      dto.graph,
    );
  }

  @Post('versions')
  copyVersion(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Body() dto: CopyVersionDto,
  ) {
    return this.definition.copyVersion(
      req.user.id,
      appId,
      formId,
      dto.fromVersionId,
    );
  }

  @Post('versions/:versionId/enable')
  enableVersion(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Param('versionId', ParseIntPipe) versionId: number,
  ) {
    return this.definition.enableVersion(req.user.id, appId, formId, versionId);
  }

  @Delete('versions/:versionId')
  deleteVersion(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Param('versionId', ParseIntPipe) versionId: number,
  ) {
    return this.definition.deleteVersion(req.user.id, appId, formId, versionId);
  }
}
