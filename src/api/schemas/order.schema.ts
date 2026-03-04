import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Order extends Document {
  @Prop({ required: true })
  recordId: string;

  @Prop({ required: true })
  qty: number;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ recordId: 1 }, { name: 'order_recordId' });
