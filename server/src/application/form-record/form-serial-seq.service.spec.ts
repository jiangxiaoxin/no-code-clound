import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FormSerialSeq } from './form-serial-seq.entity';
import { FormSerialSeqService } from './form-serial-seq.service';

describe('FormSerialSeqService', () => {
  let service: FormSerialSeqService;
  const em = {
    findOne: jest.fn(),
    create: jest.fn((_cls, data) => data),
    save: jest.fn(async (row) => row),
  };
  const repo = {
    manager: {
      transaction: jest.fn(async (fn: (tx: typeof em) => Promise<number>) =>
        fn(em),
      ),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    repo.manager.transaction.mockImplementation(async (fn) => fn(em));
    em.create.mockImplementation((_cls, data) => data);
    em.save.mockImplementation(async (row) => row);
    const module = await Test.createTestingModule({
      providers: [
        FormSerialSeqService,
        { provide: getRepositoryToken(FormSerialSeq), useValue: repo },
      ],
    }).compile();
    service = module.get(FormSerialSeqService);
  });

  it('issues start on first insert', async () => {
    em.findOne.mockResolvedValue(null);
    await expect(service.takeNext(12, 'sn', 'all', 1)).resolves.toBe(1);
    expect(em.save).toHaveBeenCalledWith(
      expect.objectContaining({ nextValue: 2 }),
    );
  });

  it('issues stored nextValue afterwards', async () => {
    em.findOne.mockResolvedValue({ nextValue: 2 });
    await expect(service.takeNext(12, 'sn', 'all', 1)).resolves.toBe(2);
    expect(em.save).toHaveBeenCalledWith(
      expect.objectContaining({ nextValue: 3 }),
    );
  });

  it('does not go backward when start increases', async () => {
    em.findOne.mockResolvedValue({ nextValue: 5 });
    await expect(service.takeNext(12, 'sn', 'all', 100)).resolves.toBe(100);
    expect(em.save).toHaveBeenCalledWith(
      expect.objectContaining({ nextValue: 101 }),
    );
  });
});
