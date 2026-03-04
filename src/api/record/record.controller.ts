import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateRecordRequestDTO } from './dtos/create-record.request.dto';
import { RecordCategory, RecordFormat } from './record.enum';
import { UpdateRecordRequestDTO } from './dtos/update-record.request.dto';
import { RecordResponseDTO } from './dtos/record.response.dto';
import { PaginatedResponseDTO } from '../common/dtos/paginated.response.dto';
import { RecordService } from './record.service';

@ApiTags('Records')
@Controller('records')
export class RecordController {
  constructor(private readonly recordService: RecordService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new record' })
  @ApiResponse({
    status: 201,
    description: 'Record successfully created',
    type: RecordResponseDTO,
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async create(
    @Body() request: CreateRecordRequestDTO,
  ): Promise<RecordResponseDTO> {
    const record = await this.recordService.createRecord(request);
    return RecordResponseDTO.from(record);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing record' })
  @ApiParam({ name: 'id', description: 'Record ID' })
  @ApiResponse({
    status: 200,
    description: 'Record updated successfully',
    type: RecordResponseDTO,
  })
  @ApiResponse({ status: 500, description: 'Cannot find record to update' })
  async update(
    @Param('id') id: string,
    @Body() updateRecordDto: UpdateRecordRequestDTO,
  ): Promise<RecordResponseDTO> {
    const record = await this.recordService.updateRecord(id, updateRecordDto);
    return RecordResponseDTO.from(record);
  }

  @Get()
  @ApiOperation({ summary: 'Get all records with optional filters' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of records',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Full-text search query across artist, album, and category',
    type: String,
  })
  @ApiQuery({
    name: 'artist',
    required: false,
    description: 'Exact match by artist name (case-insensitive)',
    type: String,
  })
  @ApiQuery({
    name: 'album',
    required: false,
    description: 'Exact match by album name (case-insensitive)',
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
    description: 'Max records to return (default 50, max 200)',
    type: Number,
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Cursor (last record ID) for pagination',
    type: String,
  })
  async findAll(
    @Query('q') q?: string,
    @Query('artist') artist?: string,
    @Query('album') album?: string,
    @Query('format') format?: RecordFormat,
    @Query('category') category?: RecordCategory,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginatedResponseDTO<RecordResponseDTO>> {
    return this.recordService.findAll({
      q,
      artist,
      album,
      format,
      category,
      limit,
      cursor,
    });
  }
}
