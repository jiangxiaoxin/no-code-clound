import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
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
import { FormRecordService } from './form-record/form-record.service';
import { FormRecordStore } from './form-record/form-record.store';
import { FormSerialSeq } from './form-record/form-serial-seq.entity';
import { FormSerialSeqService } from './form-record/form-serial-seq.service';
import { User } from '../user/user.entity';

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
      FormSerialSeq,
    ]),
    AuthModule,
  ],
  controllers: [
    ApplicationController,
    DictionaryController,
    FormRecordController,
  ],
  providers: [
    ApplicationService,
    DictionaryService,
    FormRecordStore,
    FormRecordService,
    FormSerialSeqService,
  ],
})
export class ApplicationModule {}
