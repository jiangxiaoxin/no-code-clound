import { IsObject } from 'class-validator';
import type { WorkflowGraph } from '../workflow.types';

export class SaveDraftDto {
  @IsObject({ message: '请提交流程草稿' })
  draftGraph: WorkflowGraph;
}
