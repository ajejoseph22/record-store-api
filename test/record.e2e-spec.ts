import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { RecordModule } from '../src/api/record.module';
import { OrderModule } from '../src/api/order.module';
import { RecordFormat, RecordCategory } from '../src/api/schemas/record.enum';
import {
  startTestDb,
  stopTestDb,
  clearCollections,
} from '../src/test/setup-test-db';

describe('RecordController (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let uri: string;

  beforeAll(async () => {
    uri = await startTestDb();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(uri), RecordModule, OrderModule],
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

    expect(response.body.length).toBe(1);
    expect(response.body[0]).toHaveProperty('artist', 'The Fake Band');
  });
});
