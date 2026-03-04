import { ApiProperty } from '@nestjs/swagger';

export class PaginatedResponseDTO<T> {
  @ApiProperty()
  data: T[];

  @ApiProperty({
    example: 'eyJfaWQiOiI1MDdmMWY3N2JjZjg2Y2Q3OTk0MzkwMTEifQ',
    nullable: true,
  })
  nextCursor: string | null;

  @ApiProperty({ example: true })
  hasMore: boolean;

  static create<T>(
    data: T[],
    nextCursor: string | null,
    hasMore: boolean,
  ): PaginatedResponseDTO<T> {
    const dto = new PaginatedResponseDTO<T>();
    dto.data = data;
    dto.nextCursor = nextCursor;
    dto.hasMore = hasMore;
    return dto;
  }
}
