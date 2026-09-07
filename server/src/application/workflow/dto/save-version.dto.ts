import { IsObject } from 'class-validator';
import type { WorkflowGraph } from '../workflow.types';

export class SaveVersionDto {
  @IsObject({ message: '请提交流程图' })
  graph: WorkflowGraph;
}
