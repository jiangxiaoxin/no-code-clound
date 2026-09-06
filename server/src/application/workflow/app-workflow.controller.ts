import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PatchEnabledDto } from './dto/patch-enabled.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
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

  @Put('draft')
  saveDraft(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Body() dto: SaveDraftDto,
  ) {
    return this.definition.saveDraft(req.user.id, appId, formId, dto.draftGraph);
  }

  @Post('publish')
  publish(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
  ) {
    return this.definition.publish(req.user.id, appId, formId);
  }

  @Patch()
  setEnabled(
    @Req() req: { user: { id: number } },
    @Param('appId', ParseIntPipe) appId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Body() dto: PatchEnabledDto,
  ) {
    return this.definition.setEnabled(req.user.id, appId, formId, dto.enabled);
  }
}
