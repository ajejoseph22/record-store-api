import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecordResponseDTO {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;

  @ApiProperty({ example: 'The Beatles' })
  artist: string;

  @ApiProperty({ example: 'Abbey Road' })
  album: string;

  @ApiProperty({ example: 29.99 })
  price: number;

  @ApiProperty({ example: 50 })
  qty: number;

  @ApiProperty({ example: 'Vinyl' })
  format: string;

  @ApiProperty({ example: 'Rock' })
  category: string;

  @ApiPropertyOptional({ example: 'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d' })
  mbid?: string;

  @ApiProperty({ example: ['Come Together', 'Something'], type: [String] })
  tracklist: string[];

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt: string;

  static from(doc: any): RecordResponseDTO {
    const dto = new RecordResponseDTO();
    dto.id = doc._id.toString();
    dto.artist = doc.artist;
    dto.album = doc.album;
    dto.price = doc.price;
    dto.qty = doc.qty;
    dto.format = doc.format;
    dto.category = doc.category;
    if (doc.mbid) dto.mbid = doc.mbid;
    dto.tracklist = doc.tracklist ?? [];
    dto.createdAt = doc.createdAt ?? doc.created;
    dto.updatedAt = doc.updatedAt ?? doc.lastModified;
    return dto;
  }
}
