import {
  Controller,
  Get,
  Post,
  Body,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Order } from '../schemas/order.schema';
import { Record } from '../schemas/record.schema';
import { CreateOrderRequestDTO } from '../dtos/create-order.request.dto';

@ApiTags('Orders')
@Controller('orders')
export class OrderController {
  constructor(
    @InjectModel('Order') private readonly orderModel: Model<Order>,
    @InjectModel('Record') private readonly recordModel: Model<Record>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new order' })
  @ApiResponse({
    status: 201,
    description: 'Order successfully created',
    type: Order,
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({
    status: 500,
    description: 'Record not found or insufficient stock',
  })
  async create(@Body() dto: CreateOrderRequestDTO): Promise<Order> {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(async () => {
        const record = await this.recordModel.findOneAndUpdate(
          { _id: dto.recordId, qty: { $gte: dto.qty } },
          { $inc: { qty: -dto.qty } },
          { new: true, session },
        );

        if (!record) {
          throw new InternalServerErrorException(
            'Record not found or insufficient stock',
          );
        }

        const [order] = await this.orderModel.create(
          [{ recordId: dto.recordId, qty: dto.qty }],
          { session },
        );
        return order;
      });
    } finally {
      await session.endSession();
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get all orders' })
  @ApiResponse({ status: 200, description: 'List of orders', type: [Order] })
  async findAll(): Promise<Order[]> {
    return await this.orderModel.find().lean().exec();
  }
}
