import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateOrderRequestDTO } from './dtos/create-order.request.dto';
import { OrderResponseDTO } from './dtos/order.response.dto';
import { PaginatedResponseDTO } from '../common/dtos/paginated.response.dto';
import { OrderService } from './order.service';
import { GetOrdersRequestDTO } from './dtos/get-orders.request.dto';

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
  async findAll(
    @Query() query: GetOrdersRequestDTO,
  ): Promise<PaginatedResponseDTO<OrderResponseDTO>> {
    return this.orderService.findAll(query);
  }
}
