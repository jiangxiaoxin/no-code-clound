import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WorkflowEngine } from './workflow.engine';
import { WorkflowInstance } from './workflow-instance.entity';
import { WorkflowTimeoutService } from './workflow-timeout.service';

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_MINUTE: '* * * * *' },
}));

describe('WorkflowTimeoutService', () => {
  const instanceRepo = {
    find: jest.fn(),
  };
  const engine = {
    expireIfOverdue: jest.fn(),
  };
  let service: WorkflowTimeoutService;

  beforeEach(async () => {
    jest.resetAllMocks();
    instanceRepo.find.mockResolvedValue([{ id: 3 }, { id: 4 }]);
    engine.expireIfOverdue.mockResolvedValue(true);
    const module = await Test.createTestingModule({
      providers: [
        WorkflowTimeoutService,
        { provide: getRepositoryToken(WorkflowInstance), useValue: instanceRepo },
        { provide: WorkflowEngine, useValue: engine },
      ],
    }).compile();
    service = module.get(WorkflowTimeoutService);
  });

  it('扫库时逐条调用 expireIfOverdue，单条失败不影响其余', async () => {
    engine.expireIfOverdue
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(true);
    await service.sweepOverdue();
    expect(engine.expireIfOverdue).toHaveBeenCalledWith(3);
    expect(engine.expireIfOverdue).toHaveBeenCalledWith(4);
  });
});
