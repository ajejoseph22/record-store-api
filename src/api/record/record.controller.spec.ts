import { Test, TestingModule } from '@nestjs/testing';
import { RecordController } from './record.controller';
import { RecordService } from './record.service';
import { RecordFormat, RecordCategory } from './record.enum';
import { PaginatedResponseDTO } from '../common/dtos/paginated.response.dto';

describe('RecordController', () => {
  let controller: RecordController;
  let recordService: RecordService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecordController],
      providers: [
        {
          provide: RecordService,
          useValue: {
            createRecord: jest.fn().mockResolvedValue({
              _id: '1',
              artist: 'The Beatles',
              tracklist: [],
            }),
            updateRecord: jest
              .fn()
              .mockResolvedValue({ _id: '1', price: 50, tracklist: [] }),
            findAll: jest
              .fn()
              .mockResolvedValue(PaginatedResponseDTO.create([], null, false)),
          },
        },
      ],
    }).compile();

    controller = module.get<RecordController>(RecordController);
    recordService = module.get<RecordService>(RecordService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const baseRecord = {
    artist: 'The Beatles',
    album: 'Abbey Road',
    price: 30,
    qty: 10,
    format: RecordFormat.VINYL,
    category: RecordCategory.ROCK,
  };

  describe('create', () => {
    it('should delegate to recordService.createRecord', async () => {
      await controller.create(baseRecord);

      expect(recordService.createRecord).toHaveBeenCalledWith(baseRecord);
    });

    it('should return a RecordResponseDTO', async () => {
      const result = await controller.create(baseRecord);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('artist');
    });
  });

  describe('update', () => {
    it('should delegate to recordService.updateRecord', async () => {
      await controller.update('some-id', { price: 50 });

      expect(recordService.updateRecord).toHaveBeenCalledWith('some-id', {
        price: 50,
      });
    });
  });

  describe('findAll', () => {
    it('should delegate to recordService.findAll with query DTO', async () => {
      const query = {
        q: 'q',
        artist: 'artist',
        album: 'album',
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
        limit: '10',
        cursor: 'abc123',
      };
      await controller.getAll(query);

      expect(recordService.getAll).toHaveBeenCalledWith(query);
    });

    it('should pass empty object for omitted params', async () => {
      await controller.getAll({});

      expect(recordService.getAll).toHaveBeenCalledWith({});
    });
  });
});
