import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Put,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Record } from '../schemas/record.schema';
import { FilterQuery, Model } from 'mongoose';
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { CreateRecordRequestDTO } from '../dtos/create-record.request.dto';
import { RecordCategory, RecordFormat } from '../schemas/record.enum';
import { UpdateRecordRequestDTO } from '../dtos/update-record.request.dto';

@Controller('records')
export class RecordController {
  private static readonly DEFAULT_PAGE_SIZE = 50;
  private static readonly MAX_PAGE_SIZE = 200;

  constructor(
    @InjectModel('Record') private readonly recordModel: Model<Record>,
  ) {}

  private static escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  @Post()
  @ApiOperation({ summary: 'Create a new record' })
  @ApiResponse({ status: 201, description: 'Record successfully created' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async create(@Body() request: CreateRecordRequestDTO): Promise<Record> {
    return await this.recordModel.create({
      artist: request.artist,
      album: request.album,
      price: request.price,
      qty: request.qty,
      format: request.format,
      category: request.category,
      mbid: request.mbid,
    });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing record' })
  @ApiResponse({ status: 200, description: 'Record updated successfully' })
  @ApiResponse({ status: 500, description: 'Cannot find record to update' })
  async update(
    @Param('id') id: string,
    @Body() updateRecordDto: UpdateRecordRequestDTO,
  ): Promise<Record> {
    const record = await this.recordModel.findById(id);
    if (!record) {
      throw new InternalServerErrorException('Record not found');
    }

    Object.assign(record, updateRecordDto);

    const updated = await this.recordModel.updateOne(record);
    if (!updated) {
      throw new InternalServerErrorException('Failed to update record');
    }

    return record;
  }

  @Get()
  @ApiOperation({ summary: 'Get all records with optional filters' })
  @ApiResponse({
    status: 200,
    description: 'List of records',
    type: [Record],
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description:
      'Search query (search across multiple fields like artist, album, category, etc.)',
    type: String,
  })
  @ApiQuery({
    name: 'artist',
    required: false,
    description: 'Filter by artist name',
    type: String,
  })
  @ApiQuery({
    name: 'album',
    required: false,
    description: 'Filter by album name',
    type: String,
  })
  @ApiQuery({
    name: 'format',
    required: false,
    description: 'Filter by record format (Vinyl, CD, etc.)',
    enum: RecordFormat,
    type: String,
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter by record category (e.g., Rock, Jazz)',
    enum: RecordCategory,
    type: String,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: `Max records to return (default ${RecordController.DEFAULT_PAGE_SIZE}, max ${RecordController.MAX_PAGE_SIZE})`,
    type: Number,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Number of records to skip (default 0)',
    type: Number,
  })
  async findAll(
    @Query('q') q?: string,
    @Query('artist') artist?: string,
    @Query('album') album?: string,
    @Query('format') format?: RecordFormat,
    @Query('category') category?: RecordCategory,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Record[]> {
    const conditions: FilterQuery<Record>[] = [];

    const normalizedQ = q?.trim();
    if (normalizedQ) {
      const searchRegex = new RegExp(
        RecordController.escapeRegex(normalizedQ),
        'i',
      );
      conditions.push({
        $or: [
          { artist: searchRegex },
          { album: searchRegex },
          { category: searchRegex },
        ],
      });
    }

    const normalizedArtist = artist?.trim();
    if (normalizedArtist) {
      conditions.push({
        artist: {
          $regex: new RegExp(
            RecordController.escapeRegex(normalizedArtist),
            'i',
          ),
        },
      });
    }

    const normalizedAlbum = album?.trim();
    if (normalizedAlbum) {
      conditions.push({
        album: {
          $regex: new RegExp(
            RecordController.escapeRegex(normalizedAlbum),
            'i',
          ),
        },
      });
    }

    if (format) {
      conditions.push({ format });
    }

    if (category) {
      conditions.push({ category });
    }

    const filters: FilterQuery<Record> =
      conditions.length > 1
        ? { $and: conditions }
        : conditions[0] ?? {};

    const parsedLimit = Number.parseInt(limit ?? '', 10);
    const parsedOffset = Number.parseInt(offset ?? '', 10);
    const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = RecordController;
    const resolvedLimit =
      Number.isNaN(parsedLimit) || parsedLimit <= 0
        ? DEFAULT_PAGE_SIZE
        : Math.min(parsedLimit, MAX_PAGE_SIZE);
    const resolvedOffset =
      Number.isNaN(parsedOffset) || parsedOffset < 0 ? 0 : parsedOffset;

    return this.recordModel
      .find(filters)
      .skip(resolvedOffset)
      .limit(resolvedLimit)
      .lean()
      .exec();
  }
}
