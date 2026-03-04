import { Test, TestingModule } from '@nestjs/testing';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { PaginatedResponseDTO } from '../common/dtos/paginated.response.dto';

describe('OrderController', () => {
  let controller: OrderController;
  let orderService: OrderService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        {
          provide: OrderService,
          useValue: {
            createOrder: jest.fn().mockResolvedValue({
              id: '1',
              recordId: 'rec1',
              qty: 2,
              createdAt: '2024-01-01',
              updatedAt: '2024-01-01',
            }),
            findAll: jest
              .fn()
              .mockResolvedValue(PaginatedResponseDTO.create([], null, false)),
          },
        },
      ],
    }).compile();

    controller = module.get<OrderController>(OrderController);
    orderService = module.get<OrderService>(OrderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should delegate to orderService.createOrder', async () => {
      const dto = { recordId: 'rec1', qty: 2 };
      await controller.create(dto);

      expect(orderService.createOrder).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should delegate to orderService.findAll with query DTO', async () => {
      await controller.findAll({ limit: '10', cursor: 'abc123' });

      expect(orderService.findAll).toHaveBeenCalledWith({
        limit: '10',
        cursor: 'abc123',
      });
    });

    it('should pass empty object for omitted params', async () => {
      await controller.findAll({});

      expect(orderService.findAll).toHaveBeenCalledWith({});
    });
  });
});
