import { Test, TestingModule } from '@nestjs/testing';
import { ArtifactsService } from './artifacts.service';
import { PrismaService } from '../prisma.service';

describe('ArtifactsService', () => {
  let service: ArtifactsService;
  let prisma: PrismaService;

  const mockPrisma = {
    artifact: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArtifactsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<ArtifactsService>(ArtifactsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const payload = {
      schema_version: '1.2',
      prompt_version: 'planner/v3',
      model_name: 'claude-sonnet-4-6',
      provider_name: 'anthropic',
      system_name: 'School ERP',
    };

    it('should create an artifact with correct provenance fields if it does not exist', async () => {
      mockPrisma.artifact.findFirst.mockResolvedValueOnce(null);
      mockPrisma.artifact.create.mockResolvedValueOnce({
        id: 'art-123',
        projectId: 'proj-123',
        type: 'PLAN',
        payload,
        schemaVersion: '1.2',
        promptVersion: 'planner/v3',
        modelName: 'claude-sonnet-4-6',
        providerName: 'anthropic',
      });

      const result = await service.create('proj-123', 'PLAN', payload);

      expect(prisma.artifact.findFirst).toHaveBeenCalledWith({
        where: { projectId: 'proj-123', type: 'PLAN' },
      });
      expect(prisma.artifact.create).toHaveBeenCalledWith({
        data: {
          projectId: 'proj-123',
          type: 'PLAN',
          payload,
          schemaVersion: '1.2',
          promptVersion: 'planner/v3',
          modelName: 'claude-sonnet-4-6',
          providerName: 'anthropic',
        },
      });
      expect(result.schemaVersion).toBe('1.2');
    });

    it('should update an artifact with correct provenance fields if it already exists', async () => {
      mockPrisma.artifact.findFirst.mockResolvedValueOnce({
        id: 'art-existing-123',
        projectId: 'proj-123',
        type: 'PLAN',
      });
      mockPrisma.artifact.update.mockResolvedValueOnce({
        id: 'art-existing-123',
        projectId: 'proj-123',
        type: 'PLAN',
        payload,
        schemaVersion: '1.2',
        promptVersion: 'planner/v3',
        modelName: 'claude-sonnet-4-6',
        providerName: 'anthropic',
      });

      const result = await service.create('proj-123', 'PLAN', payload);

      expect(prisma.artifact.update).toHaveBeenCalledWith({
        where: { id: 'art-existing-123' },
        data: {
          payload,
          schemaVersion: '1.2',
          promptVersion: 'planner/v3',
          modelName: 'claude-sonnet-4-6',
          providerName: 'anthropic',
        },
      });
      expect(result.schemaVersion).toBe('1.2');
    });
  });
});
