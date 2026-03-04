import { Test, TestingModule } from '@nestjs/testing';
import { RecordController } from './record.controller';
import { RecordService } from '../services/record.service';
import { RecordFormat, RecordCategory } from '../schemas/record.enum';

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
            createRecord: jest
              .fn()
              .mockResolvedValue({ _id: '1', artist: 'The Beatles' }),
            updateRecord: jest.fn().mockResolvedValue({ _id: '1', price: 50 }),
            findAll: jest.fn().mockResolvedValue([]),
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
    it('should delegate to recordService.findAll with options', async () => {
      await controller.findAll(
        'q',
        'artist',
        'album',
        RecordFormat.VINYL,
        RecordCategory.ROCK,
        '10',
        '0',
      );

      expect(recordService.findAll).toHaveBeenCalledWith({
        q: 'q',
        artist: 'artist',
        album: 'album',
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
        limit: '10',
        offset: '0',
      });
    });

    it('should pass undefined for omitted params', async () => {
      await controller.findAll();

      expect(recordService.findAll).toHaveBeenCalledWith({
        q: undefined,
        artist: undefined,
        album: undefined,
        format: undefined,
        category: undefined,
        limit: undefined,
        offset: undefined,
      });
    });
  });
});
