import { Test, TestingModule } from '@nestjs/testing';
import { RecordController } from './record.controller';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Record } from '../schemas/record.schema';
import { CreateRecordRequestDTO } from '../dtos/create-record.request.dto';
import { RecordCategory, RecordFormat } from '../schemas/record.enum';
import { RecordService } from '../services/record.service';

describe('RecordController', () => {
  let recordController: RecordController;
  let recordModel: Model<Record>;
  let recordService: { getTracklistByMbid: jest.Mock };

  function mockFindChain(result: unknown[] = []) {
    const exec = jest.fn().mockResolvedValue(result);
    const lean = jest.fn().mockReturnValue({ exec });
    const limit = jest.fn().mockReturnValue({ lean });
    const skip = jest.fn().mockReturnValue({ limit });

    jest.spyOn(recordModel, 'find').mockReturnValue({ skip } as any);

    return { exec, lean, limit, skip };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecordController],
      providers: [
        {
          provide: getModelToken('Record'),
          useValue: {
            new: jest.fn().mockResolvedValue({}),
            constructor: jest.fn().mockResolvedValue({}),
            find: jest.fn(),
            findById: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: RecordService,
          useValue: {
            getTracklistByMbid: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    recordController = module.get<RecordController>(RecordController);
    recordModel = module.get<Model<Record>>(getModelToken('Record'));
    recordService = module.get(RecordService);
  });

  it('should create a new record', async () => {
    const createRecordDto: CreateRecordRequestDTO = {
      artist: 'Test',
      album: 'Test Record',
      price: 100,
      qty: 10,
      format: RecordFormat.VINYL,
      category: RecordCategory.ALTERNATIVE,
    };

    const savedRecord = {
      _id: '1',
      name: 'Test Record',
      price: 100,
      qty: 10,
    };

    jest.spyOn(recordModel, 'create').mockResolvedValue(savedRecord as any);

    const result = await recordController.create(createRecordDto);
    expect(result).toEqual(savedRecord);
    expect(recordService.getTracklistByMbid).toHaveBeenCalledWith(undefined);
    expect(recordModel.create).toHaveBeenCalledWith({
      artist: 'Test',
      album: 'Test Record',
      price: 100,
      qty: 10,
      category: RecordCategory.ALTERNATIVE,
      format: RecordFormat.VINYL,
      mbid: undefined,
      tracklist: [],
    });
  });

  it('should create a new record with tracklist fetched from mbid', async () => {
    const createRecordDto: CreateRecordRequestDTO = {
      artist: 'The Beatles',
      album: 'Abbey Road',
      price: 25,
      qty: 10,
      format: RecordFormat.VINYL,
      category: RecordCategory.ROCK,
      mbid: 'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d',
    };
    const fetchedTracklist = ['Come Together', 'Something'];

    recordService.getTracklistByMbid.mockResolvedValueOnce(fetchedTracklist);
    jest.spyOn(recordModel, 'create').mockResolvedValue({ _id: '1' } as any);

    await recordController.create(createRecordDto);

    expect(recordService.getTracklistByMbid).toHaveBeenCalledWith(
      'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d',
    );
    expect(recordModel.create).toHaveBeenCalledWith({
      artist: 'The Beatles',
      album: 'Abbey Road',
      price: 25,
      qty: 10,
      category: RecordCategory.ROCK,
      format: RecordFormat.VINYL,
      mbid: 'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d',
      tracklist: ['Come Together', 'Something'],
    });
  });

  it('should return all records with default pagination', async () => {
    const records = [
      { _id: '1', name: 'Record 1', price: 100, qty: 10 },
      { _id: '2', name: 'Record 2', price: 200, qty: 20 },
    ];
    const { exec, lean, limit, skip } = mockFindChain(records);

    const result = await recordController.findAll();

    expect(result).toEqual(records);
    expect(recordModel.find).toHaveBeenCalledWith({});
    expect(skip).toHaveBeenCalledWith(0);
    expect(limit).toHaveBeenCalledWith(50);
    expect(lean).toHaveBeenCalled();
    expect(exec).toHaveBeenCalled();
  });

  it('should apply filters and pagination parameters', async () => {
    const { skip, limit } = mockFindChain();

    await recordController.findAll(
      'beat',
      'the',
      'road',
      RecordFormat.VINYL,
      RecordCategory.ROCK,
      '10',
      '5',
    );

    const query = (recordModel.find as jest.Mock).mock.calls[0][0];
    expect(query.$and).toBeDefined();
    expect(query.$and).toHaveLength(5);

    const textClause = query.$and.find((c: any) => c.$text);
    expect(textClause).toEqual({ $text: { $search: 'beat' } });

    const artistClause = query.$and.find((c: any) => c.artist);
    expect(artistClause.artist.$regex).toBeInstanceOf(RegExp);
    expect(artistClause.artist.$regex.source).toBe('the');
    expect(artistClause.artist.$regex.flags).toBe('i');

    const albumClause = query.$and.find((c: any) => c.album);
    expect(albumClause.album.$regex).toBeInstanceOf(RegExp);
    expect(albumClause.album.$regex.source).toBe('road');
    expect(albumClause.album.$regex.flags).toBe('i');

    expect(query.$and).toContainEqual({ format: RecordFormat.VINYL });
    expect(query.$and).toContainEqual({ category: RecordCategory.ROCK });

    expect(skip).toHaveBeenCalledWith(5);
    expect(limit).toHaveBeenCalledWith(10);
  });

  it('should use a flat query when only one filter is provided', async () => {
    mockFindChain();

    await recordController.findAll(
      undefined,
      undefined,
      undefined,
      RecordFormat.CD,
    );

    const query = (recordModel.find as jest.Mock).mock.calls[0][0];
    expect(query).toEqual({ format: RecordFormat.CD });
    expect(query.$and).toBeUndefined();
  });

  it('should clamp invalid pagination values to safe defaults', async () => {
    const { skip, limit } = mockFindChain();

    await recordController.findAll(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '9999',
      '-42',
    );

    expect(skip).toHaveBeenCalledWith(0);
    expect(limit).toHaveBeenCalledWith(200);
  });

  it('should update record and re-fetch tracklist when mbid changes', async () => {
    const save = jest.fn();
    const existingRecord = {
      _id: '1',
      artist: 'The Beatles',
      album: 'Abbey Road',
      mbid: 'old-mbid',
      tracklist: ['Old Track'],
      save,
    };
    save.mockResolvedValue(existingRecord);

    jest
      .spyOn(recordModel, 'findById')
      .mockResolvedValue(existingRecord as any);
    recordService.getTracklistByMbid.mockResolvedValueOnce([
      'Come Together',
      'Something',
    ]);

    const result = await recordController.update('1', {
      mbid: 'new-mbid',
    });

    expect(recordService.getTracklistByMbid).toHaveBeenCalledWith('new-mbid');
    expect(existingRecord.tracklist).toEqual(['Come Together', 'Something']);
    expect(save).toHaveBeenCalled();
    expect(result).toBe(existingRecord);
  });

  it('should update record without re-fetching tracklist when mbid is unchanged', async () => {
    const save = jest.fn();
    const existingRecord = {
      _id: '1',
      artist: 'The Beatles',
      album: 'Abbey Road',
      mbid: 'same-mbid',
      tracklist: ['Existing Track'],
      save,
    };
    save.mockResolvedValue(existingRecord);

    jest
      .spyOn(recordModel, 'findById')
      .mockResolvedValue(existingRecord as any);

    await recordController.update('1', { mbid: 'same-mbid', price: 30 });

    expect(recordService.getTracklistByMbid).not.toHaveBeenCalled();
    expect(existingRecord.tracklist).toEqual(['Existing Track']);
    expect(save).toHaveBeenCalled();
  });

  it('should throw when record is not found for update', async () => {
    jest.spyOn(recordModel, 'findById').mockResolvedValue(null);

    await expect(
      recordController.update('nonexistent', { price: 30 }),
    ).rejects.toThrow('Record not found');
  });
});
