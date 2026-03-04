import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { InternalServerErrorException } from '@nestjs/common';
import { RecordController } from './record.controller';
import { RecordService } from '../services/record.service';
import { RecordSchema } from '../schemas/record.schema';
import { RecordFormat, RecordCategory } from '../schemas/record.enum';
import {
  startTestDb,
  stopTestDb,
  clearCollections,
} from '../../test/setup-test-db';

describe('RecordController', () => {
  let module: TestingModule;
  let controller: RecordController;
  let connection: Connection;
  let recordService: RecordService;
  let uri: string;

  beforeAll(async () => {
    jest.setTimeout(30000);
    uri = await startTestDb();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([{ name: 'Record', schema: RecordSchema }]),
      ],
      controllers: [RecordController],
      providers: [
        {
          provide: RecordService,
          useValue: {
            getTracklistByMbid: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    controller = module.get<RecordController>(RecordController);
    recordService = module.get<RecordService>(RecordService);
    connection = module.get<Connection>(getConnectionToken());
  });

  afterEach(async () => {
    await clearCollections(connection);
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await module.close();
    await stopTestDb();
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
    it('should create a record without mbid', async () => {
      const result = await controller.create(baseRecord);

      expect(result.artist).toBe('The Beatles');
      expect(result.album).toBe('Abbey Road');
      expect(result.price).toBe(30);
      expect(result.qty).toBe(10);
      expect(result.format).toBe(RecordFormat.VINYL);
      expect(result.category).toBe(RecordCategory.ROCK);
      expect(result.tracklist).toEqual([]);
      expect(recordService.getTracklistByMbid).toHaveBeenCalledWith(undefined);
    });

    it('should fetch tracklist when mbid is provided', async () => {
      const tracks = ['Come Together', 'Something'];
      jest.spyOn(recordService, 'getTracklistByMbid').mockResolvedValue(tracks);

      const result = await controller.create({
        ...baseRecord,
        mbid: 'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d',
      });

      expect(recordService.getTracklistByMbid).toHaveBeenCalledWith(
        'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d',
      );
      expect(result.tracklist).toEqual(tracks);
    });

    it('should enforce unique constraint on artist + album + format', async () => {
      await controller.create(baseRecord);
      await expect(controller.create(baseRecord)).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update a record', async () => {
      const created = await controller.create(baseRecord);

      const updated = await controller.update(created._id.toString(), {
        price: 50,
      });

      expect(updated.price).toBe(50);
      expect(updated.artist).toBe('The Beatles');
    });

    it('should re-fetch tracklist when mbid changes', async () => {
      const created = await controller.create({
        ...baseRecord,
        mbid: 'old-mbid',
      });

      const newTracks = ['Track 1', 'Track 2'];
      jest
        .spyOn(recordService, 'getTracklistByMbid')
        .mockResolvedValue(newTracks);

      const updated = await controller.update(created._id.toString(), {
        mbid: 'new-mbid',
      });

      expect(recordService.getTracklistByMbid).toHaveBeenCalledWith('new-mbid');
      expect(updated.tracklist).toEqual(newTracks);
    });

    it('should not re-fetch tracklist when mbid is unchanged', async () => {
      const created = await controller.create({
        ...baseRecord,
        mbid: 'same-mbid',
      });

      jest.clearAllMocks();

      await controller.update(created._id.toString(), { price: 99 });

      expect(recordService.getTracklistByMbid).not.toHaveBeenCalled();
    });

    it('should throw when record not found', async () => {
      const fakeId = new Types.ObjectId().toString();

      await expect(controller.update(fakeId, { price: 50 })).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all records with default pagination', async () => {
      await controller.create(baseRecord);
      await controller.create({
        ...baseRecord,
        album: 'Let It Be',
        format: RecordFormat.CD,
      });

      const results = await controller.findAll();

      expect(results).toHaveLength(2);
    });

    it('should filter by artist (exact, case-insensitive)', async () => {
      await controller.create(baseRecord);
      await controller.create({
        ...baseRecord,
        artist: 'Pink Floyd',
        album: 'The Wall',
      });

      const results = await controller.findAll(undefined, 'the beatles');

      expect(results).toHaveLength(1);
      expect(results[0].artist).toBe('The Beatles');
    });

    it('should match artist case-insensitively', async () => {
      await controller.create(baseRecord);

      const results = await controller.findAll(undefined, 'THE BEATLES');

      expect(results).toHaveLength(1);
      expect(results[0].artist).toBe('The Beatles');
    });

    it('should not match partial artist name', async () => {
      await controller.create(baseRecord);

      const results = await controller.findAll(undefined, 'beatles');

      expect(results).toHaveLength(0);
    });

    it('should filter by album (exact, case-insensitive)', async () => {
      await controller.create(baseRecord);
      await controller.create({
        ...baseRecord,
        album: 'Let It Be',
        format: RecordFormat.CD,
      });

      const results = await controller.findAll(
        undefined,
        undefined,
        'Abbey Road',
      );

      expect(results).toHaveLength(1);
      expect(results[0].album).toBe('Abbey Road');
    });

    it('should not match partial album name', async () => {
      await controller.create(baseRecord);

      const results = await controller.findAll(undefined, undefined, 'abbey');

      expect(results).toHaveLength(0);
    });

    it('should filter by format', async () => {
      await controller.create(baseRecord);
      await controller.create({
        ...baseRecord,
        album: 'Let It Be',
        format: RecordFormat.CD,
      });

      const results = await controller.findAll(
        undefined,
        undefined,
        undefined,
        RecordFormat.CD,
      );

      expect(results).toHaveLength(1);
      expect(results[0].format).toBe(RecordFormat.CD);
    });

    it('should filter by category', async () => {
      await controller.create(baseRecord);
      await controller.create({
        ...baseRecord,
        artist: 'Miles Davis',
        album: 'Kind of Blue',
        category: RecordCategory.JAZZ,
      });

      const results = await controller.findAll(
        undefined,
        undefined,
        undefined,
        undefined,
        RecordCategory.JAZZ,
      );

      expect(results).toHaveLength(1);
      expect(results[0].category).toBe(RecordCategory.JAZZ);
    });

    it('should respect limit and offset', async () => {
      for (let i = 0; i < 5; i++) {
        await controller.create({
          ...baseRecord,
          album: `Album ${i}`,
        });
      }

      const results = await controller.findAll(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '2',
        '1',
      );

      expect(results).toHaveLength(2);
    });

    it('should clamp limit to max 200', async () => {
      await controller.create(baseRecord);

      const results = await controller.findAll(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '9999',
      );

      // Should not throw, just clamp
      expect(results).toHaveLength(1);
    });

    it('should use text search with q parameter', async () => {
      await controller.create(baseRecord);
      await controller.create({
        ...baseRecord,
        artist: 'Pink Floyd',
        album: 'The Wall',
      });

      const results = await controller.findAll('Beatles');

      expect(results).toHaveLength(1);
      expect(results[0].artist).toBe('The Beatles');
    });
  });
});
