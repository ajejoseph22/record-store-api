import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { InternalServerErrorException } from '@nestjs/common';
import { RecordService } from './record.service';
import { RecordSchema } from '../schemas/record.schema';
import { RecordFormat, RecordCategory } from '../schemas/record.enum';
import { CacheHelper } from '../cache/cache.helper';
import {
  startTestDb,
  stopTestDb,
  clearCollections,
} from '../../test/setup-test-db';

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
        MongooseModule.forFeature([{ name: 'Record', schema: RecordSchema }]),
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

    it('should fetch and parse tracklist from musicbrainz xml', async () => {
      const xml = `
        <metadata>
          <release>
            <medium-list>
              <medium>
                <track-list>
                  <track>
                    <recording>
                      <title>Come Together</title>
                    </recording>
                  </track>
                  <track>
                    <recording>
                      <title>Maxwell&apos;s Silver Hammer &amp; More</title>
                    </recording>
                  </track>
                </track-list>
              </medium>
            </medium-list>
          </release>
        </metadata>
      `;

      fetchMock.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(xml),
      });

      const tracklist = await service.getTracklistByMbid(
        'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d',
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'https://musicbrainz.org/ws/2/release/b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d?inc=recordings&fmt=xml',
        expect.objectContaining({
          headers: { Accept: 'application/xml' },
        }),
      );
      expect(tracklist).toEqual([
        'Come Together',
        "Maxwell's Silver Hammer & More",
      ]);
    });

    it('should return empty tracklist when musicbrainz responds with non-200', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        text: jest.fn(),
      });

      const tracklist = await service.getTracklistByMbid(
        'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d',
      );

      expect(tracklist).toEqual([]);
    });

    it('should return empty tracklist when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('network issue'));

      const tracklist = await service.getTracklistByMbid(
        'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d',
      );

      expect(tracklist).toEqual([]);
    });

    it('should return empty tracklist when request times out', async () => {
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

      const tracklist = await promise;
      expect(tracklist).toEqual([]);

      jest.useRealTimers();
    });

    it('should skip tracks with no title element', async () => {
      const xml = `
        <metadata>
          <release>
            <medium-list>
              <medium>
                <track-list>
                  <track>
                    <recording>
                      <title>Valid Track</title>
                    </recording>
                  </track>
                  <track>
                    <recording></recording>
                  </track>
                </track-list>
              </medium>
            </medium-list>
          </release>
        </metadata>
      `;

      fetchMock.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(xml),
      });

      const tracklist = await service.getTracklistByMbid('some-mbid');
      expect(tracklist).toEqual(['Valid Track']);
    });

    it('should return empty tracklist when xml has no track nodes', async () => {
      const xml = `<metadata><release><medium-list></medium-list></release></metadata>`;

      fetchMock.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(xml),
      });

      const tracklist = await service.getTracklistByMbid('some-mbid');
      expect(tracklist).toEqual([]);
    });

    it('should decode decimal numeric xml entities', async () => {
      const xml = `
        <metadata>
          <release>
            <medium-list>
              <medium>
                <track-list>
                  <track>
                    <recording>
                      <title>Rock &#38; Roll &#60;Live&#62;</title>
                    </recording>
                  </track>
                  <track>
                    <recording>
                      <title>Caf&#xe9; &#x26; Bar</title>
                    </recording>
                  </track>
                </track-list>
              </medium>
            </medium-list>
          </release>
        </metadata>
      `;

      fetchMock.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(xml),
      });

      const tracklist = await service.getTracklistByMbid('some-mbid');
      expect(tracklist).toEqual(['Rock & Roll <Live>', 'Caf\u00e9 & Bar']);
    });

    it('should still fetch from MusicBrainz when cache returns undefined (miss)', async () => {
      (cacheHelper.get as jest.Mock).mockResolvedValue(undefined);

      const xml = `
        <metadata><release><medium-list><medium><track-list>
          <track><recording><title>Track 1</title></recording></track>
        </track-list></medium></medium-list></release></metadata>
      `;

      fetchMock.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(xml),
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
      const xml = `
        <metadata><release><medium-list><medium><track-list>
          <track><recording><title>Come Together</title></recording></track>
          <track><recording><title>Something</title></recording></track>
        </track-list></medium></medium-list></release></metadata>
      `;
      fetchMock.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(xml),
      });

      const result = await service.createRecord({
        ...baseRecord,
        mbid: 'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d',
      });

      expect(result.tracklist).toEqual(['Come Together', 'Something']);
    });

    it('should enforce unique constraint on artist + album + format', async () => {
      await service.createRecord(baseRecord);
      await expect(service.createRecord(baseRecord)).rejects.toThrow();
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
      const created = await service.createRecord({
        ...baseRecord,
        mbid: 'old-mbid',
      });

      const xml = `
        <metadata><release><medium-list><medium><track-list>
          <track><recording><title>Track 1</title></recording></track>
          <track><recording><title>Track 2</title></recording></track>
        </track-list></medium></medium-list></release></metadata>
      `;
      fetchMock.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(xml),
      });

      const updated = await service.updateRecord(created._id.toString(), {
        mbid: 'new-mbid',
      });

      expect(updated.tracklist).toEqual(['Track 1', 'Track 2']);
    });

    it('should not re-fetch tracklist when mbid is unchanged', async () => {
      const created = await service.createRecord({
        ...baseRecord,
        mbid: 'same-mbid',
      });

      fetchMock.mockClear();

      await service.updateRecord(created._id.toString(), { price: 99 });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should throw when record not found', async () => {
      const fakeId = new Types.ObjectId().toString();

      await expect(service.updateRecord(fakeId, { price: 50 })).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should bump records cache version', async () => {
      const created = await service.createRecord(baseRecord);
      jest.clearAllMocks();

      await service.updateRecord(created._id.toString(), { price: 50 });

      expect(cacheHelper.bumpVersion).toHaveBeenCalledWith('records');
    });
  });

  // --- findAll tests ---

  describe('findAll', () => {
    it('should return all records with default pagination', async () => {
      await service.createRecord(baseRecord);
      await service.createRecord({
        ...baseRecord,
        album: 'Let It Be',
        format: RecordFormat.CD,
      });

      const results = await service.findAll();

      expect(results).toHaveLength(2);
    });

    it('should filter by artist (exact, case-insensitive)', async () => {
      await service.createRecord(baseRecord);
      await service.createRecord({
        ...baseRecord,
        artist: 'Pink Floyd',
        album: 'The Wall',
      });

      const results = await service.findAll({ artist: 'the beatles' });

      expect(results).toHaveLength(1);
      expect(results[0].artist).toBe('The Beatles');
    });

    it('should match artist case-insensitively', async () => {
      await service.createRecord(baseRecord);

      const results = await service.findAll({ artist: 'THE BEATLES' });

      expect(results).toHaveLength(1);
      expect(results[0].artist).toBe('The Beatles');
    });

    it('should not match partial artist name', async () => {
      await service.createRecord(baseRecord);

      const results = await service.findAll({ artist: 'beatles' });

      expect(results).toHaveLength(0);
    });

    it('should filter by album (exact, case-insensitive)', async () => {
      await service.createRecord(baseRecord);
      await service.createRecord({
        ...baseRecord,
        album: 'Let It Be',
        format: RecordFormat.CD,
      });

      const results = await service.findAll({ album: 'Abbey Road' });

      expect(results).toHaveLength(1);
      expect(results[0].album).toBe('Abbey Road');
    });

    it('should not match partial album name', async () => {
      await service.createRecord(baseRecord);

      const results = await service.findAll({ album: 'abbey' });

      expect(results).toHaveLength(0);
    });

    it('should filter by format', async () => {
      await service.createRecord(baseRecord);
      await service.createRecord({
        ...baseRecord,
        album: 'Let It Be',
        format: RecordFormat.CD,
      });

      const results = await service.findAll({ format: RecordFormat.CD });

      expect(results).toHaveLength(1);
      expect(results[0].format).toBe(RecordFormat.CD);
    });

    it('should filter by category', async () => {
      await service.createRecord(baseRecord);
      await service.createRecord({
        ...baseRecord,
        artist: 'Miles Davis',
        album: 'Kind of Blue',
        category: RecordCategory.JAZZ,
      });

      const results = await service.findAll({ category: RecordCategory.JAZZ });

      expect(results).toHaveLength(1);
      expect(results[0].category).toBe(RecordCategory.JAZZ);
    });

    it('should respect limit and offset', async () => {
      for (let i = 0; i < 5; i++) {
        await service.createRecord({
          ...baseRecord,
          album: `Album ${i}`,
        });
      }

      const results = await service.findAll({ limit: '2', offset: '1' });

      expect(results).toHaveLength(2);
    });

    it('should clamp limit to max 200', async () => {
      await service.createRecord(baseRecord);

      const results = await service.findAll({ limit: '9999' });

      expect(results).toHaveLength(1);
    });

    it('should use text search with q parameter', async () => {
      await service.createRecord(baseRecord);
      await service.createRecord({
        ...baseRecord,
        artist: 'Pink Floyd',
        album: 'The Wall',
      });

      const results = await service.findAll({ q: 'Beatles' });

      expect(results).toHaveLength(1);
      expect(results[0].artist).toBe('The Beatles');
    });

    it('should return cached data without querying the DB', async () => {
      const cachedData = [{ artist: 'Cached Artist', album: 'Cached Album' }];
      jest.spyOn(cacheHelper, 'get').mockResolvedValueOnce(cachedData);
      (cacheHelper.set as jest.Mock).mockClear();

      const results = await service.findAll();

      expect(results).toEqual(cachedData);
      expect(cacheHelper.set).not.toHaveBeenCalled();
    });

    it('should miss cache after version bump', async () => {
      await service.createRecord(baseRecord);
      jest.clearAllMocks();

      jest.spyOn(cacheHelper, 'getVersion').mockResolvedValueOnce(0);
      jest.spyOn(cacheHelper, 'get').mockResolvedValue(undefined);
      const setSpy = jest.spyOn(cacheHelper, 'set');

      await service.findAll();
      expect(setSpy).toHaveBeenCalledTimes(1);

      setSpy.mockClear();

      jest.spyOn(cacheHelper, 'getVersion').mockResolvedValueOnce(1);
      await service.findAll();
      expect(setSpy).toHaveBeenCalledTimes(1);
    });
  });
});
