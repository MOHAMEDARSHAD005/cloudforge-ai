import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { PrismaService } from '../prisma.service';
import { execSync } from 'child_process';

describe('Projects (Integration)', () => {
  let app: INestApplication;
  let postgresContainer: StartedTestContainer;
  let redisContainer: StartedTestContainer;
  let prismaService: PrismaService;

  // Set a long timeout because Testcontainers might take time to download images/start
  jest.setTimeout(120000);

  beforeAll(async () => {
    // 1. Start Postgres Container
    postgresContainer = await new GenericContainer('postgres:16')
      .withExposedPorts(5432)
      .withEnvironment({
        POSTGRES_USER: 'test_user',
        POSTGRES_PASSWORD: 'test_password',
        POSTGRES_DB: 'test_db',
      })
      .start();

    const pgPort = postgresContainer.getMappedPort(5432);
    const pgHost = postgresContainer.getHost();
    const databaseUrl = `postgresql://test_user:test_password@${pgHost}:${pgPort}/test_db?schema=public`;

    // Set DATABASE_URL env var so Prisma client and migrations connect to the container
    process.env.DATABASE_URL = databaseUrl;

    // 2. Start Redis Container
    redisContainer = await new GenericContainer('redis:7')
      .withExposedPorts(6379)
      .start();

    const redisPort = redisContainer.getMappedPort(6379);
    const redisHost = redisContainer.getHost();

    process.env.REDIS_HOST = redisHost;
    process.env.REDIS_PORT = redisPort.toString();

    // 3. Run Prisma migrations on the container database
    execSync('npx prisma db push --schema=prisma/schema.prisma --accept-data-loss', {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    });

    // 4. Create Nest Testing Module
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prismaService = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (postgresContainer) {
      await postgresContainer.stop();
    }
    if (redisContainer) {
      await redisContainer.stop();
    }
  });

  beforeEach(async () => {
    // Clean up database tables before each test
    await prismaService.tokenUsage.deleteMany({});
    await prismaService.jobEvent.deleteMany({});
    await prismaService.job.deleteMany({});
    await prismaService.artifact.deleteMany({});
    await prismaService.project.deleteMany({});
    await prismaService.user.deleteMany({});
  });

  describe('POST /api/v1/projects', () => {
    it('should create Project + Job in DB and enqueue BullMQ job', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('x-user-id', 'test-user-1')
        .send({ prompt: 'Build a school ERP for 50,000 users' })
        .expect(201);

      expect(response.body).toHaveProperty('projectId');
      expect(response.body).toHaveProperty('jobId');
      expect(response.body.prompt).toBe('Build a school ERP for 50,000 users');
      expect(response.body.status).toBe('PENDING');

      // Verify DB records
      const dbProject = await prismaService.project.findUnique({
        where: { id: response.body.projectId },
        include: { jobs: true },
      });

      expect(dbProject).toBeDefined();
      expect(dbProject?.userId).toBe('test-user-1');
      expect(dbProject?.prompt).toBe('Build a school ERP for 50,000 users');
      expect(dbProject?.jobs.length).toBe(1);
      expect(dbProject?.jobs[0].id).toBe(response.body.jobId);
    });
  });

  describe('GET /api/v1/projects/:id (ownership protection)', () => {
    it('should allow accessing owned project, but reject access with a different userId (404)', async () => {
      // 1. Create a project under test-user-1
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('x-user-id', 'test-user-1')
        .send({ prompt: 'Test ERP ownership' })
        .expect(201);

      const projectId = createResponse.body.projectId;

      // 2. Fetch using same user -> success
      const getSuccess = await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}`)
        .set('x-user-id', 'test-user-1')
        .expect(200);

      expect(getSuccess.body.id).toBe(projectId);

      // 3. Fetch using different user -> 404
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}`)
        .set('x-user-id', 'test-user-2')
        .expect(404);
    });
  });
});
