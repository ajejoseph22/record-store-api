import { IsString, IsNotEmpty, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderRequestDTO {
  @ApiProperty({
    description: 'ID of the record to order',
    type: String,
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsNotEmpty()
  recordId!: string;

  @ApiProperty({
    description: 'Quantity of records to order',
    type: Number,
    example: 2,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  qty!: number;
}
