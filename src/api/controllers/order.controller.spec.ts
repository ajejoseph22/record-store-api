import { Test, TestingModule } from '@nestjs/testing';
import { OrderController } from './order.controller';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from '../schemas/order.schema';
import { Record } from '../schemas/record.schema';
import { InternalServerErrorException } from '@nestjs/common';

describe('OrderController', () => {
  let orderController: OrderController;
  let orderModel: Model<Order>;
  let recordModel: Model<Record>;

  beforeEach(async () => {
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
            findById: jest.fn(),
          },
        },
      ],
    }).compile();

    orderController = module.get<OrderController>(OrderController);
    orderModel = module.get<Model<Order>>(getModelToken('Order'));
    recordModel = module.get<Model<Record>>(getModelToken('Record'));
  });

  it('should create an order and decrement stock', async () => {
    const save = jest.fn();
    const record = { _id: 'rec1', qty: 10, save };
    save.mockResolvedValue(record);

    jest.spyOn(recordModel, 'findById').mockResolvedValue(record as any);

    const createdOrder = { _id: 'ord1', recordId: 'rec1', qty: 3 };
    jest.spyOn(orderModel, 'create').mockResolvedValue(createdOrder as any);

    const result = await orderController.create({
      recordId: 'rec1',
      qty: 3,
    });

    expect(recordModel.findById).toHaveBeenCalledWith('rec1');
    expect(record.qty).toBe(7);
    expect(save).toHaveBeenCalled();
    expect(orderModel.create).toHaveBeenCalledWith({
      recordId: 'rec1',
      qty: 3,
    });
    expect(result).toEqual(createdOrder);
  });

  it('should throw when record not found', async () => {
    jest.spyOn(recordModel, 'findById').mockResolvedValue(null);

    await expect(
      orderController.create({ recordId: 'nonexistent', qty: 1 }),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('should throw when insufficient stock', async () => {
    const record = { _id: 'rec1', qty: 1, save: jest.fn() };
    jest.spyOn(recordModel, 'findById').mockResolvedValue(record as any);

    await expect(
      orderController.create({ recordId: 'rec1', qty: 5 }),
    ).rejects.toThrow(InternalServerErrorException);

    expect(record.save).not.toHaveBeenCalled();
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
