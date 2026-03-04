import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import * as request from 'supertest';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { RecordModule } from '../src/api/record/record.module';
import { OrderModule } from '../src/api/order/order.module';
import { CacheHelperModule } from '../src/api/cache/cache-helper.module';
import { RecordFormat, RecordCategory } from '../src/api/record/record.enum';
import {
  startTestDb,
  stopTestDb,
  clearCollections,
} from './helpers/setup-test-db';

describe('RecordController (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let uri: string;

  beforeAll(async () => {
    uri = await startTestDb();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        CacheModule.register({ isGlobal: true, ttl: 60000, max: 500 }),
        CacheHelperModule,
        MongooseModule.forRoot(uri),
        RecordModule,
        OrderModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    connection = app.get<Connection>(getConnectionToken());
    await app.init();
  });

  afterEach(async () => {
    await clearCollections(connection);
  });

  afterAll(async () => {
    await app.close();
    await stopTestDb();
  });

  it('should create a new record', async () => {
    const response = await request(app.getHttpServer())
      .post('/records')
      .send({
        artist: 'The Beatles',
        album: 'Abbey Road',
        price: 25,
        qty: 10,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('artist', 'The Beatles');
    expect(response.body).toHaveProperty('album', 'Abbey Road');
  });

  it('should create a new record and fetch it with filters', async () => {
    await request(app.getHttpServer())
      .post('/records')
      .send({
        artist: 'The Fake Band',
        album: 'Fake Album',
        price: 25,
        qty: 10,
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/records?artist=The Fake Band')
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toHaveProperty('artist', 'The Fake Band');
    expect(response.body).toHaveProperty('nextCursor');
    expect(response.body).toHaveProperty('hasMore', false);
  });

  it('should paginate records with cursor', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/records')
        .send({
          artist: `Artist ${i}`,
          album: `Album ${i}`,
          price: 25,
          qty: 10,
          format: RecordFormat.VINYL,
          category: RecordCategory.ROCK,
        })
        .expect(201);
    }

    const page1 = await request(app.getHttpServer())
      .get('/records?limit=2')
      .expect(200);

    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.hasMore).toBe(true);
    expect(page1.body.nextCursor).toBeDefined();

    const page2 = await request(app.getHttpServer())
      .get(`/records?limit=2&cursor=${page1.body.nextCursor}`)
      .expect(200);

    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.hasMore).toBe(false);
  });
});
