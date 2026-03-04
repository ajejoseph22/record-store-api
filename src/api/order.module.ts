import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrderController } from './controllers/order.controller';
import { OrderSchema } from './schemas/order.schema';
import { RecordSchema } from './schemas/record.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Order', schema: OrderSchema },
      { name: 'Record', schema: RecordSchema },
    ]),
  ],
  controllers: [OrderController],
})
export class OrderModule {}
