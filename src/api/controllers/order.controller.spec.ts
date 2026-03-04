import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { InternalServerErrorException } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderSchema } from '../schemas/order.schema';
import { RecordSchema } from '../schemas/record.schema';
import { RecordFormat, RecordCategory } from '../schemas/record.enum';
import {
  startTestDb,
  stopTestDb,
  clearCollections,
} from '../../test/setup-test-db';

describe('OrderController', () => {
  let module: TestingModule;
  let orderController: OrderController;
  let connection: Connection;
  let uri: string;

  beforeAll(async () => {
    jest.setTimeout(30000);
    uri = await startTestDb();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: 'Order', schema: OrderSchema },
          { name: 'Record', schema: RecordSchema },
        ]),
      ],
      controllers: [OrderController],
    }).compile();

    orderController = module.get<OrderController>(OrderController);
    connection = module.get<Connection>(getConnectionToken());
  });

  afterEach(async () => {
    await clearCollections(connection);
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

  it('should create an order and decrement stock', async () => {
    const { insertedId } = await createRecord({ qty: 10 });

    const order = await orderController.create({
      recordId: insertedId.toString(),
      qty: 3,
    });

    expect(order.recordId).toBe(insertedId.toString());
    expect(order.qty).toBe(3);

    const record = await connection
      .collection('records')
      .findOne({ _id: insertedId });
    expect(record.qty).toBe(7);
  });

  it('should throw when record not found', async () => {
    const fakeId = new Types.ObjectId().toString();

    await expect(
      orderController.create({ recordId: fakeId, qty: 1 }),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('should throw when insufficient stock', async () => {
    const { insertedId } = await createRecord({ qty: 2 });

    await expect(
      orderController.create({ recordId: insertedId.toString(), qty: 5 }),
    ).rejects.toThrow(InternalServerErrorException);

    // Stock should be unchanged
    const record = await connection
      .collection('records')
      .findOne({ _id: insertedId });
    expect(record.qty).toBe(2);
  });

  it('should return all orders', async () => {
    const { insertedId } = await createRecord({ qty: 10 });

    await orderController.create({ recordId: insertedId.toString(), qty: 2 });
    await orderController.create({ recordId: insertedId.toString(), qty: 3 });

    const orders = await orderController.findAll();

    expect(orders).toHaveLength(2);
    expect(orders[0].qty).toBe(2);
    expect(orders[1].qty).toBe(3);
  });
});
