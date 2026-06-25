import { Test, TestingModule } from '@nestjs/testing';
import { JobsService, InvalidStatusTransitionError } from './jobs.service';
import { PrismaService } from '../prisma.service';
import { JobStatus } from '@cloudforge/shared-config';

describe('JobsService', () => {
  let service: JobsService;
  let prisma: PrismaService;

  const mockPrisma = {
    job: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('updateStatus', () => {
    it('should successfully transition from PENDING to RUNNING', async () => {
      mockPrisma.job.findUnique.mockResolvedValueOnce({ status: JobStatus.PENDING });
      mockPrisma.job.update.mockResolvedValueOnce({ id: 'job-123', status: JobStatus.RUNNING });

      const result = await service.updateStatus('job-123', JobStatus.RUNNING);

      expect(prisma.job.findUnique).toHaveBeenCalledWith({ where: { id: 'job-123' }, select: { status: true } });
      expect(prisma.job.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: expect.objectContaining({
          status: JobStatus.RUNNING,
          startedAt: expect.any(Date),
        }),
      });
      expect(result.status).toBe(JobStatus.RUNNING);
    });

    it('should throw InvalidStatusTransitionError when transitioning from COMPLETE to RUNNING', async () => {
      mockPrisma.job.findUnique.mockResolvedValueOnce({ status: JobStatus.COMPLETE });

      await expect(service.updateStatus('job-123', JobStatus.RUNNING)).rejects.toThrow(
        InvalidStatusTransitionError,
      );

      expect(prisma.job.update).not.toHaveBeenCalled();
    });
  });
});
