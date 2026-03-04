import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetOrdersRequestDTO {
  @ApiPropertyOptional({
    description: 'Max orders to return (default 50, max 200)',
  })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({
    description: 'Cursor (last order ID) for pagination',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
