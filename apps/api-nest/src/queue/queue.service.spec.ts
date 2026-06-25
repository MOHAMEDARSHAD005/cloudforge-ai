import { Test, TestingModule } from '@nestjs/testing';
import { QueueService } from './queue.service';
import { getQueueToken } from '@nestjs/bullmq';

describe('QueueService', () => {
  let service: QueueService;
  let queue: any;

  const mockQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        {
          provide: getQueueToken('jobs'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
    queue = module.get(getQueueToken('jobs'));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('enqueueJob', () => {
    it('should add job to the "jobs" queue with correct payload and options', async () => {
      mockQueue.add.mockResolvedValueOnce({ id: 'bullmq-job-id' });

      const result = await service.enqueueJob(
        'job-123',
        'project-123',
        'Build a school ERP for 50,000 users',
        'trace-123'
      );

      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add).toHaveBeenCalledWith(
        'generate',
        {
          jobId: 'job-123',
          projectId: 'project-123',
          prompt: 'Build a school ERP for 50,000 users',
          traceId: 'trace-123',
        },
        expect.objectContaining({
          jobId: 'job-123',
          attempts: 3,
          backoff: expect.objectContaining({
            type: 'exponential',
            delay: 2000,
          }),
        })
      );
      expect(result).toEqual({ id: 'bullmq-job-id' });
    });
  });
});
