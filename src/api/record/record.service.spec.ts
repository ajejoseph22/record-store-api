import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RecordService } from './record.service';
import { Record, RecordSchema } from './record.schema';
import { RecordFormat, RecordCategory } from './record.enum';
import { CacheHelper } from '../common/cache/cache.helper';
import { decodeCursor } from '../common/utils/cursor';
import {
  startTestDb,
  stopTestDb,
  clearCollections,
} from '../../../test/helpers/setup-test-db';

describe('RecordService', () => {
  let module: TestingModule;
  let service: RecordService;
  let connection: Connection;
  let cacheHelper: CacheHelper;
  let fetchMock: jest.Mock;
  let uri: string;

  beforeAll(async () => {
    jest.setTimeout(30000);
    uri = await startTestDb();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Record.name, schema: RecordSchema },
        ]),
      ],
      providers: [
        RecordService,
        {
          provide: CacheHelper,
          useValue: {
            get: jest.fn().mockResolvedValue(undefined),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
            bumpVersion: jest.fn().mockResolvedValue(1),
            getVersion: jest.fn().mockResolvedValue(0),
          },
        },
      ],
    }).compile();

    service = module.get<RecordService>(RecordService);
    cacheHelper = module.get<CacheHelper>(CacheHelper);
    connection = module.get<Connection>(getConnectionToken());

    fetchMock = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  });

  afterEach(async () => {
    await clearCollections(connection);
    jest.restoreAllMocks();
    fetchMock.mockReset();
    (cacheHelper.get as jest.Mock).mockResolvedValue(undefined);
    (cacheHelper.set as jest.Mock).mockResolvedValue(undefined);
    (cacheHelper.bumpVersion as jest.Mock).mockResolvedValue(1);
    (cacheHelper.getVersion as jest.Mock).mockResolvedValue(0);
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

  // --- MusicBrainz / tracklist tests ---

  describe('getTracklistByMbid', () => {
    it('should return empty tracklist when mbid is not provided', async () => {
      const tracklist = await service.getTracklistByMbid(undefined);

      expect(tracklist).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should fetch and parse tracklist from musicbrainz json', async () => {
      const jsonBody = {
        media: [
          {
            tracks: [
              { title: 'Come Together' },
              { title: "Maxwell's Silver Hammer & More" },
            ],
          },
        ],
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(jsonBody),
      });

      const tracklist = await service.getTracklistByMbid(
        'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d',
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'https://musicbrainz.org/ws/2/release/b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d?inc=recordings&fmt=json',
        expect.objectContaining({
          headers: {
            Accept: 'application/json',
            'User-Agent': 'VinylRecordCollectionApp/1.0',
          },
        }),
      );
      expect(tracklist).toEqual([
        'Come Together',
        "Maxwell's Silver Hammer & More",
      ]);
    });

    it('should throw NotFoundException when musicbrainz returns 404', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404 });

      await expect(
        service.getTracklistByMbid('b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when musicbrainz returns 400', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 400 });

      await expect(service.getTracklistByMbid('not-a-uuid')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadGatewayException when musicbrainz returns other errors', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 });

      await expect(
        service.getTracklistByMbid('b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('network issue'));

      await expect(
        service.getTracklistByMbid('b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException when request times out', async () => {
      jest.useFakeTimers();

      fetchMock.mockImplementation(
        (_url: string, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      );

      const promise = service.getTracklistByMbid('some-mbid');
      await Promise.resolve();
      jest.advanceTimersByTime(5000);

      await expect(promise).rejects.toThrow(BadGatewayException);

      jest.useRealTimers();
    });

    it('should skip tracks with no title', async () => {
      const jsonBody = {
        media: [
          {
            tracks: [{ title: 'Valid Track' }, { title: '' }, {}],
          },
        ],
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(jsonBody),
      });

      const tracklist = await service.getTracklistByMbid('some-mbid');
      expect(tracklist).toEqual(['Valid Track']);
    });

    it('should return empty tracklist when json has no media', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({}),
      });

      const tracklist = await service.getTracklistByMbid('some-mbid');
      expect(tracklist).toEqual([]);
    });

    it('should still fetch from MusicBrainz when cache returns undefined (miss)', async () => {
      (cacheHelper.get as jest.Mock).mockResolvedValue(undefined);

      const jsonBody = {
        media: [{ tracks: [{ title: 'Track 1' }] }],
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(jsonBody),
      });

      const tracklist = await service.getTracklistByMbid('some-mbid');
      expect(tracklist).toEqual(['Track 1']);
      expect(fetchMock).toHaveBeenCalled();
      expect(cacheHelper.set).toHaveBeenCalledWith(
        'mb:some-mbid',
        ['Track 1'],
        86400000,
      );
    });

    it('should return cached tracklist on cache hit', async () => {
      (cacheHelper.get as jest.Mock).mockResolvedValue(['Cached Track']);

      const tracklist = await service.getTracklistByMbid('some-mbid');
      expect(tracklist).toEqual(['Cached Track']);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // --- createRecord tests ---

  describe('createRecord', () => {
    it('should create a record without mbid', async () => {
      const result = await service.createRecord(baseRecord);

      expect(result.artist).toBe('The Beatles');
      expect(result.album).toBe('Abbey Road');
      expect(result.price).toBe(30);
      expect(result.qty).toBe(10);
      expect(result.format).toBe(RecordFormat.VINYL);
      expect(result.category).toBe(RecordCategory.ROCK);
      expect(result.tracklist).toEqual([]);
    });

    it('should fetch tracklist when mbid is provided', async () => {
      const jsonBody = {
        media: [
          { tracks: [{ title: 'Come Together' }, { title: 'Something' }] },
        ],
      };
      fetchMock.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(jsonBody),
      });

      const result = await service.createRecord({
        ...baseRecord,
        mbid: 'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d',
      });

      expect(result.tracklist).toEqual(['Come Together', 'Something']);
    });

    it('should throw ConflictException on duplicate artist + album + format', async () => {
      await service.createRecord(baseRecord);

      await expect(service.createRecord(baseRecord)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should bump records cache version', async () => {
      await service.createRecord(baseRecord);

      expect(cacheHelper.bumpVersion).toHaveBeenCalledWith('records');
    });
  });

  // --- updateRecord tests ---

  describe('updateRecord', () => {
    it('should update a record', async () => {
      const created = await service.createRecord(baseRecord);

      const updated = await service.updateRecord(created._id.toString(), {
        price: 50,
      });

      expect(updated.price).toBe(50);
      expect(updated.artist).toBe('The Beatles');
    });

    it('should re-fetch tracklist when mbid changes', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ media: [] }),
      });

      const created = await service.createRecord({
        ...baseRecord,
        mbid: 'old-mbid',
      });

      const jsonBody = {
        media: [{ tracks: [{ title: 'Track 1' }, { title: 'Track 2' }] }],
      };
      fetchMock.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(jsonBody),
      });

      const updated = await service.updateRecord(created._id.toString(), {
        mbid: 'new-mbid',
      });

      expect(updated.tracklist).toEqual(['Track 1', 'Track 2']);
    });

    it('should not re-fetch tracklist when mbid is unchanged', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ media: [] }),
      });

      const created = await service.createRecord({
        ...baseRecord,
        mbid: 'same-mbid',
      });

      fetchMock.mockClear();

      await service.updateRecord(created._id.toString(), { price: 99 });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when record not found', async () => {
      const fakeId = new Types.ObjectId().toString();

      await expect(service.updateRecord(fakeId, { price: 50 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should bump records cache version', async () => {
      const created = await service.createRecord(baseRecord);
      jest.clearAllMocks();

      await service.updateRecord(created._id.toString(), { price: 50 });

      expect(cacheHelper.bumpVersion).toHaveBeenCalledWith('records');
    });
  });

  // --- getAll tests ---

  describe('getAll', () => {
    it('should return all records with default pagination', async () => {
      await service.createRecord(baseRecord);
      await service.createRecord({
        ...baseRecord,
        album: 'Let It Be',
        format: RecordFormat.CD,
      });

      const result = await service.getAll();

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should filter by artist (exact, case-insensitive)', async () => {
      await service.createRecord(baseRecord);
      await service.createRecord({
        ...baseRecord,
        artist: 'Pink Floyd',
        album: 'The Wall',
      });

      const result = await service.getAll({ artist: 'the beatles' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].artist).toBe('The Beatles');
    });

    it('should match artist case-insensitively', async () => {
      await service.createRecord(baseRecord);

      const result = await service.getAll({ artist: 'THE BEATLES' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].artist).toBe('The Beatles');
    });

    it('should not match partial artist name', async () => {
      await service.createRecord(baseRecord);

      const result = await service.getAll({ artist: 'beatles' });

      expect(result.data).toHaveLength(0);
    });

    it('should filter by album (exact, case-insensitive)', async () => {
      await service.createRecord(baseRecord);
      await service.createRecord({
        ...baseRecord,
        album: 'Let It Be',
        format: RecordFormat.CD,
      });

      const result = await service.getAll({ album: 'Abbey Road' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].album).toBe('Abbey Road');
    });

    it('should not match partial album name', async () => {
      await service.createRecord(baseRecord);

      const result = await service.getAll({ album: 'abbey' });

      expect(result.data).toHaveLength(0);
    });

    it('should filter by format', async () => {
      await service.createRecord(baseRecord);
      await service.createRecord({
        ...baseRecord,
        album: 'Let It Be',
        format: RecordFormat.CD,
      });

      const result = await service.getAll({ format: RecordFormat.CD });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].format).toBe(RecordFormat.CD);
    });

    it('should filter by category', async () => {
      await service.createRecord(baseRecord);
      await service.createRecord({
        ...baseRecord,
        artist: 'Miles Davis',
        album: 'Kind of Blue',
        category: RecordCategory.JAZZ,
      });

      const result = await service.getAll({ category: RecordCategory.JAZZ });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].category).toBe(RecordCategory.JAZZ);
    });

    it('should respect limit and cursor', async () => {
      for (let i = 0; i < 5; i++) {
        await service.createRecord({
          ...baseRecord,
          album: `Album ${i}`,
        });
      }

      const page1 = await service.getAll({ limit: '2' });

      expect(page1.data).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await service.getAll({
        limit: '2',
        cursor: page1.nextCursor!,
      });

      expect(page2.data).toHaveLength(2);
      expect(page2.data[0].id).not.toBe(page1.data[0].id);
      expect(page2.data[0].id).not.toBe(page1.data[1].id);
    });

    it('should clamp limit to max 200', async () => {
      await service.createRecord(baseRecord);

      const result = await service.getAll({ limit: '9999' });

      expect(result.data).toHaveLength(1);
    });

    it('should use text search with q parameter', async () => {
      await service.createRecord(baseRecord);
      await service.createRecord({
        ...baseRecord,
        artist: 'Pink Floyd',
        album: 'The Wall',
      });

      const result = await service.getAll({ q: 'Beatles' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].artist).toBe('The Beatles');
    });

    it('should return cached data without querying the DB', async () => {
      const cachedPage = {
        data: [{ id: '1', artist: 'Cached Artist' }],
        nextCursor: null,
        hasMore: false,
      };
      jest.spyOn(cacheHelper, 'get').mockResolvedValueOnce(cachedPage);
      (cacheHelper.set as jest.Mock).mockClear();

      const result = await service.getAll();

      expect(result).toEqual(cachedPage);
      expect(cacheHelper.set).not.toHaveBeenCalled();
    });

    it('should miss cache after version bump', async () => {
      await service.createRecord(baseRecord);
      jest.clearAllMocks();

      jest.spyOn(cacheHelper, 'getVersion').mockResolvedValueOnce(0);
      jest.spyOn(cacheHelper, 'get').mockResolvedValue(undefined);
      const setSpy = jest.spyOn(cacheHelper, 'set');

      await service.getAll();
      expect(setSpy).toHaveBeenCalledTimes(1);

      setSpy.mockClear();

      jest.spyOn(cacheHelper, 'getVersion').mockResolvedValueOnce(1);
      await service.getAll();
      expect(setSpy).toHaveBeenCalledTimes(1);
    });

    it('should return an opaque cursor that decodes to contain _id', async () => {
      for (let i = 0; i < 3; i++) {
        await service.createRecord({
          ...baseRecord,
          album: `Album ${i}`,
        });
      }

      const page = await service.getAll({ limit: '2' });

      expect(page.nextCursor).toBeDefined();
      expect(Types.ObjectId.isValid(page.nextCursor!)).toBe(false);
      const decoded = decodeCursor(page.nextCursor!);
      expect(decoded).toHaveProperty('_id');
      expect(Types.ObjectId.isValid(decoded!._id as string)).toBe(true);
    });

    it('should return RecordResponseDTO objects with id field', async () => {
      await service.createRecord(baseRecord);

      const result = await service.getAll();

      expect(result.data[0]).toHaveProperty('id');
      expect(result.data[0]).toHaveProperty('artist', 'The Beatles');
      expect(result.data[0]).not.toHaveProperty('_id');
      expect(result.data[0]).not.toHaveProperty('artistNormalized');
    });
  });
});
