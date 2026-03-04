import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { RecordFormat, RecordCategory } from './record.enum';

@Schema({ timestamps: true })
export class Record extends Document {
  @ApiProperty({
    description: 'Record ID',
    example: '507f1f77bcf86cd799439011',
  })
  _id: string;

  @ApiProperty({ description: 'Artist name', example: 'The Beatles' })
  @Prop({ required: true })
  artist: string;

  @ApiProperty({ description: 'Album name', example: 'Abbey Road' })
  @Prop({ required: true })
  album: string;

  @ApiProperty({ description: 'Price of the record', example: 29.99 })
  @Prop({ required: true })
  price: number;

  @ApiProperty({ description: 'Quantity in stock', example: 50 })
  @Prop({ required: true })
  qty: number;

  @ApiProperty({
    description: 'Record format',
    enum: RecordFormat,
    example: RecordFormat.VINYL,
  })
  @Prop({ enum: RecordFormat, required: true })
  format: RecordFormat;

  @ApiProperty({
    description: 'Record category/genre',
    enum: RecordCategory,
    example: RecordCategory.ROCK,
  })
  @Prop({ enum: RecordCategory, required: true })
  category: RecordCategory;

  @ApiProperty({
    description: 'Creation date',
    example: '2024-01-01T00:00:00.000Z',
  })
  @Prop({ default: Date.now })
  created: Date;

  @ApiProperty({
    description: 'Last modification date',
    example: '2024-01-01T00:00:00.000Z',
  })
  @Prop({ default: Date.now })
  lastModified: Date;

  @Prop({ required: true, select: false })
  artistNormalized: string;

  @Prop({ required: true, select: false })
  albumNormalized: string;

  @ApiProperty({
    description: 'MusicBrainz identifier',
    example: 'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d',
    required: false,
  })
  @Prop({ required: false })
  mbid?: string;

  @ApiProperty({
    description: 'List of track titles',
    example: ['Come Together', 'Something', 'Here Comes the Sun'],
    type: [String],
  })
  @Prop({ type: [String], default: [] })
  tracklist: string[];
}

export const RecordSchema = SchemaFactory.createForClass(Record);

RecordSchema.pre('validate', function () {
  if (this.artist != null) {
    this.artistNormalized = this.artist.trim().toLowerCase();
  }
  if (this.album != null) {
    this.albumNormalized = this.album.trim().toLowerCase();
  }
});

RecordSchema.pre(['findOneAndUpdate', 'updateOne'], function () {
  const update = this.getUpdate() as any;
  const set = update.$set ?? update;
  if (set.artist != null) {
    set.artistNormalized = String(set.artist).trim().toLowerCase();
  }
  if (set.album != null) {
    set.albumNormalized = String(set.album).trim().toLowerCase();
  }
  if (update.$set) {
    update.$set = set;
  } else {
    Object.assign(update, set);
  }
  this.setUpdate(update);
});

RecordSchema.index(
  { artist: 1, album: 1, format: 1 },
  { unique: true, name: 'record_unique_artist_album_format' },
);
RecordSchema.index(
  { artist: 'text', album: 'text', category: 'text' },
  { name: 'record_text_search' },
);
RecordSchema.index(
  { format: 1, category: 1 },
  { name: 'record_format_category' },
);
RecordSchema.index({ category: 1 }, { name: 'record_category' });
RecordSchema.index(
  { artistNormalized: 1 },
  { name: 'record_artist_normalized' },
);
RecordSchema.index({ albumNormalized: 1 }, { name: 'record_album_normalized' });
