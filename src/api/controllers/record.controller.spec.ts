import { Test, TestingModule } from '@nestjs/testing';
import { RecordController } from './record.controller';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Record } from '../schemas/record.schema';
import { CreateRecordRequestDTO } from '../dtos/create-record.request.dto';
import { RecordCategory, RecordFormat } from '../schemas/record.enum';

describe('RecordController', () => {
  let recordController: RecordController;
  let recordModel: Model<Record>;

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
      ],
    }).compile();

    recordController = module.get<RecordController>(RecordController);
    recordModel = module.get<Model<Record>>(getModelToken('Record'));
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
    expect(recordModel.create).toHaveBeenCalledWith({
      artist: 'Test',
      album: 'Test Record',
      price: 100,
      qty: 10,
      category: RecordCategory.ALTERNATIVE,
      format: RecordFormat.VINYL,
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

    const orClause = query.$and.find((c: any) => c.$or);
    expect(orClause.$or).toHaveLength(3);
    expect(orClause.$or[0].artist).toBeInstanceOf(RegExp);

    const artistClause = query.$and.find(
      (c: any) => c.artist && !c.$or,
    );
    expect(artistClause.artist.$regex).toBeInstanceOf(RegExp);
    expect(artistClause.artist.$regex.source).toBe('the');

    const albumClause = query.$and.find((c: any) => c.album);
    expect(albumClause.album.$regex).toBeInstanceOf(RegExp);
    expect(albumClause.album.$regex.source).toBe('road');

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
});
