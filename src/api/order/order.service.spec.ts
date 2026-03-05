import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { UnprocessableEntityException } from '@nestjs/common';
import { getLoggerToken } from 'nestjs-pino';
import { OrderService } from './order.service';
import { Order, OrderSchema } from './order.schema';
import { Record, RecordSchema } from '../record/record.schema';
import { RecordFormat, RecordCategory } from '../record/record.enum';
import { CacheHelper } from '../common/cache/cache.helper';
import { decodeCursor } from '../common/utils/cursor';
import {
  startTestDb,
  stopTestDb,
  clearCollections,
} from '../../../test/helpers/setup-test-db';

describe('OrderService', () => {
  let module: TestingModule;
  let service: OrderService;
  let connection: Connection;
  let cacheHelper: CacheHelper;
  let uri: string;

  beforeAll(async () => {
    jest.setTimeout(30000);
    uri = await startTestDb();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Order.name, schema: OrderSchema },
          { name: Record.name, schema: RecordSchema },
        ]),
      ],
      providers: [
        OrderService,
        {
          provide: CacheHelper,
          useValue: {
            get: jest.fn().mockResolvedValue(undefined),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
            bumpVersion: jest.fn().mockResolvedValue(1),
            getVersion: jest.fn().mockResolvedValue(0),
          },
        },
        {
          provide: getLoggerToken(OrderService.name),
          useValue: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            trace: jest.fn(),
            setContext: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
    cacheHelper = module.get<CacheHelper>(CacheHelper);
    connection = module.get<Connection>(getConnectionToken());
  });

  afterEach(async () => {
    await clearCollections(connection);
    jest.clearAllMocks();
    (cacheHelper.get as jest.Mock).mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await module.close();
    await stopTestDb();
  });

  async function createRecord(overrides = {}) {
    return connection.collection('records').insertOne({
      artist: 'The Beatles',
      album: 'Abbey Road',
      price: 30,
      qty: 10,
      format: RecordFormat.VINYL,
      category: RecordCategory.ROCK,
      tracklist: [],
      created: new Date(),
      lastModified: new Date(),
      ...overrides,
    });
  }

  describe('createOrder', () => {
    it('should create an order and decrement stock', async () => {
      const { insertedId } = await createRecord({ qty: 10 });

      const order = await service.createOrder({
        recordId: insertedId.toString(),
        qty: 3,
      });

      expect(order.recordId).toBe(insertedId.toString());
      expect(order.qty).toBe(3);
      expect(order).toHaveProperty('id');

      const record = await connection
        .collection('records')
        .findOne({ _id: insertedId });
      expect(record!.qty).toBe(7);
    });

    it('should throw when record not found', async () => {
      const fakeId = new Types.ObjectId().toString();

      await expect(
        service.createOrder({ recordId: fakeId, qty: 1 }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw when insufficient stock', async () => {
      const { insertedId } = await createRecord({ qty: 2 });

      await expect(
        service.createOrder({ recordId: insertedId.toString(), qty: 5 }),
      ).rejects.toThrow(UnprocessableEntityException);

      const record = await connection
        .collection('records')
        .findOne({ _id: insertedId });
      expect(record!.qty).toBe(2);
    });

    it('should bump both orders and records cache versions', async () => {
      const { insertedId } = await createRecord({ qty: 10 });

      await service.createOrder({
        recordId: insertedId.toString(),
        qty: 1,
      });

      expect(cacheHelper.bumpVersion).toHaveBeenCalledWith('orders');
      expect(cacheHelper.bumpVersion).toHaveBeenCalledWith('records');
    });

    it('should return an OrderResponseDTO', async () => {
      const { insertedId } = await createRecord({ qty: 10 });

      const order = await service.createOrder({
        recordId: insertedId.toString(),
        qty: 1,
      });

      expect(order).toHaveProperty('id');
      expect(order).toHaveProperty('recordId');
      expect(order).toHaveProperty('qty');
      expect(order).not.toHaveProperty('_id');
    });
  });

  describe('getAll', () => {
    it('should return paginated orders', async () => {
      const { insertedId } = await createRecord({ qty: 10 });

      await service.createOrder({ recordId: insertedId.toString(), qty: 2 });
      await service.createOrder({ recordId: insertedId.toString(), qty: 3 });

      const result = await service.getAll();

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should support cursor-based pagination', async () => {
      const { insertedId } = await createRecord({ qty: 100 });

      for (let i = 0; i < 5; i++) {
        await service.createOrder({ recordId: insertedId.toString(), qty: 1 });
      }

      const page1 = await service.getAll({ limit: '2' });

      expect(page1.data).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await service.getAll({
        limit: '2',
        cursor: page1.nextCursor!,
      });

      expect(page2.data).toHaveLength(2);
      expect(page2.data[0].id).not.toBe(page1.data[0].id);
      expect(page2.data[0].id).not.toBe(page1.data[1].id);
    });

    it('should return an opaque cursor that decodes to contain _id', async () => {
      const { insertedId } = await createRecord({ qty: 100 });

      for (let i = 0; i < 3; i++) {
        await service.createOrder({ recordId: insertedId.toString(), qty: 1 });
      }

      const page = await service.getAll({ limit: '2' });

      expect(page.nextCursor).toBeDefined();
      expect(Types.ObjectId.isValid(page.nextCursor!)).toBe(false);
      const decoded = decodeCursor(page.nextCursor!);
      expect(decoded).toHaveProperty('_id');
      expect(Types.ObjectId.isValid(decoded!._id as string)).toBe(true);
    });

    it('should return cached data on cache hit', async () => {
      const cachedPage = {
        data: [{ id: '1', recordId: 'rec1', qty: 1 }],
        nextCursor: null,
        hasMore: false,
      };
      (cacheHelper.get as jest.Mock).mockResolvedValueOnce(cachedPage);

      const result = await service.getAll();

      expect(result).toEqual(cachedPage);
      expect(cacheHelper.set).not.toHaveBeenCalled();
    });

    it('should return OrderResponseDTO objects', async () => {
      const { insertedId } = await createRecord({ qty: 10 });
      await service.createOrder({ recordId: insertedId.toString(), qty: 1 });

      const result = await service.getAll();

      expect(result.data[0]).toHaveProperty('id');
      expect(result.data[0]).toHaveProperty('recordId');
      expect(result.data[0]).not.toHaveProperty('_id');
    });
  });
});
