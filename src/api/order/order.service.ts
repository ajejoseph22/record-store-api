import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, FilterQuery, Model, Types } from 'mongoose';
import { Order } from './order.schema';
import { Record } from '../record/record.schema';
import { CreateOrderRequestDTO } from './dtos/create-order.request.dto';
import { OrderResponseDTO } from './dtos/order.response.dto';
import { PaginatedResponseDTO } from '../common/dtos/paginated.response.dto';
import { CacheHelper } from '../common/utils/cache/cache.helper';
import { encodeCursor, decodeCursor } from '../common/utils/cursor';

export interface FindAllOrderOptions {
  limit?: string;
  cursor?: string;
}

@Injectable()
export class OrderService {
  private static readonly PAGINATION_CACHE_TTL = 300_000; // 5 minutes
  private static readonly DEFAULT_PAGE_SIZE = 50;
  private static readonly MAX_PAGE_SIZE = 200;
  private static readonly ORDERS_NAMESPACE = 'orders';
  private static readonly RECORDS_NAMESPACE = 'records';

  constructor(
    @InjectModel('Order') private readonly orderModel: Model<Order>,
    @InjectModel('Record') private readonly recordModel: Model<Record>,
    @InjectConnection() private readonly connection: Connection,
    private readonly cacheHelper: CacheHelper,
  ) {}

  async createOrder(dto: CreateOrderRequestDTO): Promise<OrderResponseDTO> {
    const session = await this.connection.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const record = await this.recordModel.findOneAndUpdate(
          { _id: dto.recordId, qty: { $gte: dto.qty } },
          { $inc: { qty: -dto.qty } },
          { new: true, session },
        );

        if (!record) {
          throw new UnprocessableEntityException(
            'Record not found or insufficient stock',
          );
        }

        const [order] = await this.orderModel.create(
          [{ recordId: dto.recordId, qty: dto.qty }],
          { session },
        );
        return order;
      });

      await this.cacheHelper.bumpVersion(OrderService.ORDERS_NAMESPACE);
      await this.cacheHelper.bumpVersion(OrderService.RECORDS_NAMESPACE);
      return OrderResponseDTO.from(result);
    } finally {
      await session.endSession();
    }
  }

  async findAll(
    options: FindAllOrderOptions = {},
  ): Promise<PaginatedResponseDTO<OrderResponseDTO>> {
    const { limit, cursor } = options;

    const parsedLimit = Number.parseInt(limit ?? '', 10);
    const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = OrderService;
    const resolvedLimit =
      Number.isNaN(parsedLimit) || parsedLimit <= 0
        ? DEFAULT_PAGE_SIZE
        : Math.min(parsedLimit, MAX_PAGE_SIZE);

    const version = await this.cacheHelper.getVersion(
      OrderService.ORDERS_NAMESPACE,
    );
    const cacheKey = `orders:v${version}:${resolvedLimit}:${cursor ?? ''}`;

    const cached =
      await this.cacheHelper.get<PaginatedResponseDTO<OrderResponseDTO>>(
        cacheKey,
      );
    if (cached) {
      return cached;
    }

    let filters: FilterQuery<Order> = {};
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded?._id && Types.ObjectId.isValid(decoded._id as string)) {
        filters = { _id: { $gt: new Types.ObjectId(decoded._id as string) } };
      }
    }

    const results = await this.orderModel
      .find(filters)
      .sort({ _id: 1 })
      .limit(resolvedLimit)
      .lean()
      .exec();

    const data = results.map(OrderResponseDTO.from);
    const hasMore = results.length === resolvedLimit;
    const nextCursor = hasMore
      ? encodeCursor({ _id: results[results.length - 1]._id.toString() })
      : null;

    const page = PaginatedResponseDTO.create(data, nextCursor, hasMore);
    await this.cacheHelper.set(
      cacheKey,
      page,
      OrderService.PAGINATION_CACHE_TTL,
    );
    return page;
  }
}
