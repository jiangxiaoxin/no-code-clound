import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AppAccessAdminService } from './access/app-access-admin.service';
import { AppAccessController } from './access/app-access.controller';
import { AppAccessScope } from './access/app-access-scope.entity';
import { AppAccessService } from './access/app-access.service';
import { FormDataAccessService } from './form-data-access.service';
import { AppConfigurator } from './access/app-configurator.entity';
import { AppForm } from './app-form.entity';
import { AppFormConfig } from './app-form-config.entity';
import { AppGroup } from './app-group.entity';
import { ApplicationController } from './application.controller';
import { Application } from './application.entity';
import { ApplicationService } from './application.service';
import { DictionaryController } from './dictionary/dictionary.controller';
import { DictionaryItem } from './dictionary/dictionary-item.entity';
import { Dictionary } from './dictionary/dictionary.entity';
import { DictionaryService } from './dictionary/dictionary.service';
import { FormRecordController } from './form-record/form-record.controller';
import { FormRecordPersistService } from './form-record/form-record.persist';
import { FormRecordService } from './form-record/form-record.service';
import { FormRecordStore } from './form-record/form-record.store';
import { FormSerialSeq } from './form-record/form-serial-seq.entity';
import { FormSerialSeqService } from './form-record/form-serial-seq.service';
import { Department } from '../admin/department/department.entity';
import { UserDepartment } from '../admin/department/user-department.entity';
import { Role } from '../admin/role/role.entity';
import { UserRole } from '../admin/role/user-role.entity';
import { User } from '../user/user.entity';
import { AppWorkflowController } from './workflow/app-workflow.controller';
import { WorkflowController } from './workflow/workflow.controller';
import { WorkflowApproverService } from './workflow/workflow.approver';
import { WorkflowDefinitionService } from './workflow/workflow-definition.service';
import { WorkflowEngine } from './workflow/workflow.engine';
import { WorkflowInboxService } from './workflow/workflow-inbox.service';
import { WorkflowInstanceService } from './workflow/workflow-instance.service';
import { WorkflowRenderService } from './workflow/workflow-render.service';
import { WorkflowTimeoutService } from './workflow/workflow-timeout.service';
import { WorkflowDefinition } from './workflow/workflow-definition.entity';
import { WorkflowInstance } from './workflow/workflow-instance.entity';
import { WorkflowTask } from './workflow/workflow-task.entity';
import { WorkflowVersion } from './workflow/workflow-version.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Application,
      AppGroup,
      AppForm,
      AppFormConfig,
      Dictionary,
      DictionaryItem,
      User,
      Role,
      UserRole,
      Department,
      UserDepartment,
      AppConfigurator,
      AppAccessScope,
      FormSerialSeq,
      WorkflowDefinition,
      WorkflowVersion,
      WorkflowInstance,
      WorkflowTask,
    ]),
    AuthModule,
  ],
  controllers: [
    ApplicationController,
    AppAccessController,
    DictionaryController,
    FormRecordController,
    AppWorkflowController,
    WorkflowController,
  ],
  providers: [
    AppAccessService,
    AppAccessAdminService,
    FormDataAccessService,
    ApplicationService,
    DictionaryService,
    FormRecordStore,
    FormRecordPersistService,
    FormRecordService,
    FormSerialSeqService,
    WorkflowApproverService,
    WorkflowDefinitionService,
    WorkflowEngine,
    WorkflowInboxService,
    WorkflowInstanceService,
    WorkflowRenderService,
    WorkflowTimeoutService,
  ],
  exports: [AppAccessAdminService],
})
export class ApplicationModule {}
