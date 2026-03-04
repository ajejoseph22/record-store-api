import { Test, TestingModule } from '@nestjs/testing';
import { OrderController } from './order.controller';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from '../schemas/order.schema';
import { Record } from '../schemas/record.schema';
import { InternalServerErrorException } from '@nestjs/common';

describe('OrderController', () => {
  let orderController: OrderController;
  let orderModel: Model<Order>;
  let recordModel: Model<Record>;
  let mockSession: any;

  beforeEach(async () => {
    mockSession = {
      withTransaction: jest.fn((fn) => fn()),
      endSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        {
          provide: getModelToken('Order'),
          useValue: {
            create: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getModelToken('Record'),
          useValue: {
            findOneAndUpdate: jest.fn(),
          },
        },
        {
          provide: getConnectionToken(),
          useValue: {
            startSession: jest.fn().mockResolvedValue(mockSession),
          },
        },
      ],
    }).compile();

    orderController = module.get<OrderController>(OrderController);
    orderModel = module.get<Model<Order>>(getModelToken('Order'));
    recordModel = module.get<Model<Record>>(getModelToken('Record'));
  });

  it('should create an order and decrement stock', async () => {
    const record = { _id: 'rec1', qty: 7 };
    jest
      .spyOn(recordModel, 'findOneAndUpdate')
      .mockResolvedValue(record as any);

    const createdOrder = { _id: 'ord1', recordId: 'rec1', qty: 3 };
    jest.spyOn(orderModel, 'create').mockResolvedValue([createdOrder] as any);

    const result = await orderController.create({
      recordId: 'rec1',
      qty: 3,
    });

    expect(recordModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'rec1', qty: { $gte: 3 } },
      { $inc: { qty: -3 } },
      { new: true, session: mockSession },
    );
    expect(orderModel.create).toHaveBeenCalledWith(
      [{ recordId: 'rec1', qty: 3 }],
      { session: mockSession },
    );
    expect(result).toEqual(createdOrder);
    expect(mockSession.endSession).toHaveBeenCalled();
  });

  it('should throw when record not found or insufficient stock', async () => {
    jest.spyOn(recordModel, 'findOneAndUpdate').mockResolvedValue(null);

    await expect(
      orderController.create({ recordId: 'nonexistent', qty: 1 }),
    ).rejects.toThrow(InternalServerErrorException);

    expect(mockSession.endSession).toHaveBeenCalled();
  });

  it('should return all orders', async () => {
    const orders = [
      { _id: 'ord1', recordId: 'rec1', qty: 2 },
      { _id: 'ord2', recordId: 'rec2', qty: 1 },
    ];
    const exec = jest.fn().mockResolvedValue(orders);
    const lean = jest.fn().mockReturnValue({ exec });
    jest.spyOn(orderModel, 'find').mockReturnValue({ lean } as any);

    const result = await orderController.findAll();

    expect(result).toEqual(orders);
    expect(orderModel.find).toHaveBeenCalled();
    expect(lean).toHaveBeenCalled();
    expect(exec).toHaveBeenCalled();
  });
});
