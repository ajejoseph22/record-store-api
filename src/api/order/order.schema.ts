import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

@Schema({ timestamps: true })
export class Order extends Document {
  @ApiProperty({ description: 'Order ID', example: '507f1f77bcf86cd799439011' })
  _id: string;

  @ApiProperty({
    description: 'ID of the ordered record',
    example: '507f1f77bcf86cd799439011',
  })
  @Prop({ required: true })
  recordId: string;

  @ApiProperty({ description: 'Quantity ordered', example: 2 })
  @Prop({ required: true })
  qty: number;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ recordId: 1 }, { name: 'order_recordId' });
