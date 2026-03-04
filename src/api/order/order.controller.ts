import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateOrderRequestDTO } from './dtos/create-order.request.dto';
import { OrderResponseDTO } from './dtos/order.response.dto';
import { PaginatedResponseDTO } from '../common/dtos/paginated.response.dto';
import { OrderService } from './order.service';

@ApiTags('Orders')
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new order' })
  @ApiResponse({
    status: 201,
    description: 'Order successfully created',
    type: OrderResponseDTO,
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async create(@Body() dto: CreateOrderRequestDTO): Promise<OrderResponseDTO> {
    return this.orderService.createOrder(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all orders' })
  @ApiResponse({ status: 200, description: 'Paginated list of orders' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max orders to return (default 50, max 200)',
    type: Number,
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Cursor (last order ID) for pagination',
    type: String,
  })
  async findAll(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginatedResponseDTO<OrderResponseDTO>> {
    return this.orderService.findAll({ limit, cursor });
  }
}
