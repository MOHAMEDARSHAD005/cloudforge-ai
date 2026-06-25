import { Test, TestingModule } from '@nestjs/testing';
import { TokenUsageService } from './token-usage.service';
import { PrismaService } from '../prisma.service';

describe('TokenUsageService', () => {
  let service: TokenUsageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenUsageService,
        {
          provide: PrismaService,
          useValue: {}, // Mock Prisma client
        },
      ],
    }).compile();

    service = module.get<TokenUsageService>(TokenUsageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateCost', () => {
    it('should calculate cost for Sonnet correctly', () => {
      const cost = service.calculateCost('claude-sonnet-4-6', 1000, 2000);
      expect(cost).toBeCloseTo(0.033, 6);
    });

    it('should calculate cost for Haiku correctly', () => {
      const cost = service.calculateCost('claude-haiku-4-5', 1000, 2000);
      expect(cost).toBeCloseTo(0.0088, 6);
    });
  });
});
