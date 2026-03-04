import { ApiProperty } from '@nestjs/swagger';

export class OrderResponseDTO {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id!: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  recordId!: string;

  @ApiProperty({ example: 2 })
  qty!: number;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt!: string;

  static from(doc: any): OrderResponseDTO {
    const dto = new OrderResponseDTO();
    dto.id = doc._id.toString();
    dto.recordId = doc.recordId;
    dto.qty = doc.qty;
    dto.createdAt = doc.createdAt;
    return dto;
  }
}
