import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateRecordRequestDTO } from './dtos/create-record.request.dto';
import { UpdateRecordRequestDTO } from './dtos/update-record.request.dto';
import { RecordResponseDTO } from './dtos/record.response.dto';
import { PaginatedResponseDTO } from '../common/dtos/paginated.response.dto';
import { RecordService } from './record.service';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { GetRecordsRequestDTO } from './dtos/get-records.request.dto';

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
  @ApiResponse({
    status: 409,
    description: 'Duplicate artist/album/format combination',
  })
  @ApiResponse({ status: 502, description: 'MusicBrainz unavailable' })
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
  @ApiResponse({ status: 404, description: 'Record not found' })
  @ApiResponse({
    status: 409,
    description: 'Duplicate artist/album/format combination',
  })
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
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
  async getAll(
    @Query() query: GetRecordsRequestDTO,
  ): Promise<PaginatedResponseDTO<RecordResponseDTO>> {
    return this.recordService.getAll(query);
  }
}
