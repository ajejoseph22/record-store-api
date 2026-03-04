import {
  Controller,
  Get,
  Post,
  Body,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Order } from '../schemas/order.schema';
import { Record } from '../schemas/record.schema';
import { CreateOrderRequestDTO } from '../dtos/create-order.request.dto';

@Controller('orders')
export class OrderController {
  constructor(
    @InjectModel('Order') private readonly orderModel: Model<Order>,
    @InjectModel('Record') private readonly recordModel: Model<Record>,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new order' })
  @ApiResponse({ status: 201, description: 'Order successfully created' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({
    status: 500,
    description: 'Record not found or insufficient stock',
  })
  async create(@Body() dto: CreateOrderRequestDTO): Promise<Order> {
    const record = await this.recordModel.findById(dto.recordId);
    if (!record) {
      throw new InternalServerErrorException('Record not found');
    }

    if (record.qty < dto.qty) {
      throw new InternalServerErrorException('Insufficient stock');
    }

    record.qty -= dto.qty;
    await record.save();

    return await this.orderModel.create({
      recordId: dto.recordId,
      qty: dto.qty,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get all orders' })
  @ApiResponse({ status: 200, description: 'List of orders', type: [Order] })
  async findAll(): Promise<Order[]> {
    return await this.orderModel.find().lean().exec();
  }
}
