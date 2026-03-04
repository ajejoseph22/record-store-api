import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Record } from './record.schema';
import { CreateRecordRequestDTO } from './dtos/create-record.request.dto';
import { UpdateRecordRequestDTO } from './dtos/update-record.request.dto';
import { RecordResponseDTO } from './dtos/record.response.dto';
import { PaginatedResponseDTO } from '../common/dtos/paginated.response.dto';
import { CacheHelper } from '../common/cache/cache.helper';
import { encodeCursor, decodeCursor } from '../common/utils/cursor';
import { GetRecordsRequestDTO } from './dtos/get-records.request.dto';

@Injectable()
export class RecordService {
  private static readonly MUSICBRAINZ_RELEASE_URL =
    'https://musicbrainz.org/ws/2/release';
  private static readonly REQUEST_TIMEOUT_MS = 5000;
  private static readonly MB_CACHE_TTL = 86400000; // 24 hours
  private static readonly PAGINATION_CACHE_TTL = 300_000; // 5 minutes
  private static readonly DEFAULT_PAGE_SIZE = 50;
  private static readonly MAX_PAGE_SIZE = 200;
  static readonly NAMESPACE = 'records';
  private readonly logger = new Logger(RecordService.name);

  constructor(
    @InjectModel(Record.name) private readonly recordModel: Model<Record>,
    private readonly cacheHelper: CacheHelper,
  ) {}

  async createRecord(dto: CreateRecordRequestDTO): Promise<Record> {
    const tracklist = await this.getTracklistByMbid(dto.mbid);

    try {
      const record = await this.recordModel.create({
        artist: dto.artist,
        album: dto.album,
        price: dto.price,
        qty: dto.qty,
        format: dto.format,
        category: dto.category,
        mbid: dto.mbid,
        tracklist,
        artistNormalized: dto.artist.trim().toLowerCase(),
        albumNormalized: dto.album.trim().toLowerCase(),
      });

      await this.cacheHelper.bumpVersion(RecordService.NAMESPACE);
      return record;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException(
          `A record by "${dto.artist}" - "${dto.album}" (${dto.format}) already exists`,
        );
      }
      throw err;
    }
  }

  async updateRecord(id: string, dto: UpdateRecordRequestDTO): Promise<Record> {
    const setFields: Partial<globalThis.Record<string, unknown>> = {};

    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        setFields[key] = value;
      }
    }

    if (setFields.mbid) {
      const existing = await this.recordModel
        .findById(id)
        .select('mbid')
        .lean();

      if (!existing) {
        throw new NotFoundException(`Record with id "${id}" not found`);
      }

      if (setFields.mbid !== existing.mbid) {
        setFields.tracklist = await this.getTracklistByMbid(
          setFields.mbid as string,
        );
      }
    }

    try {
      const updated = await this.recordModel.findOneAndUpdate(
        { _id: id },
        { $set: setFields },
        { new: true },
      );

      if (!updated) {
        throw new NotFoundException(`Record with id "${id}" not found`);
      }

      await this.cacheHelper.bumpVersion(RecordService.NAMESPACE);
      return updated;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException(
          'This update would create a duplicate artist/album/format combination',
        );
      }
      throw err;
    }
  }

  async getAll(
    options: GetRecordsRequestDTO = {},
  ): Promise<PaginatedResponseDTO<RecordResponseDTO>> {
    const { q, artist, album, format, category, limit, cursor } = options;
    const conditions: FilterQuery<Record>[] = [];

    const normalizedQ = q?.trim();
    if (normalizedQ) {
      conditions.push({ $text: { $search: normalizedQ } });
    }

    const normalizedArtist = artist?.trim();
    if (normalizedArtist) {
      conditions.push({ artistNormalized: normalizedArtist.toLowerCase() });
    }

    const normalizedAlbum = album?.trim();
    if (normalizedAlbum) {
      conditions.push({ albumNormalized: normalizedAlbum.toLowerCase() });
    }

    if (format) {
      conditions.push({ format });
    }

    if (category) {
      conditions.push({ category });
    }

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded?._id && Types.ObjectId.isValid(decoded._id as string)) {
        conditions.push({
          _id: { $gt: new Types.ObjectId(decoded._id as string) },
        });
      }
    }

    const filters: FilterQuery<Record> =
      conditions.length > 1 ? { $and: conditions } : (conditions[0] ?? {});

    const parsedLimit = Number.parseInt(limit ?? '', 10);
    const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = RecordService;
    const resolvedLimit =
      Number.isNaN(parsedLimit) || parsedLimit <= 0
        ? DEFAULT_PAGE_SIZE
        : Math.min(parsedLimit, MAX_PAGE_SIZE);

    const version = await this.cacheHelper.getVersion(RecordService.NAMESPACE);
    const cacheKey = `records:v${version}:${(q ?? '').trim().toLowerCase()}:${(artist ?? '').trim().toLowerCase()}:${(album ?? '').trim().toLowerCase()}:${format ?? ''}:${category ?? ''}:${resolvedLimit}:${cursor ?? ''}`;

    const cached =
      await this.cacheHelper.get<PaginatedResponseDTO<RecordResponseDTO>>(
        cacheKey,
      );
    if (cached) {
      return cached;
    }

    const results = await this.recordModel
      .find(filters)
      .sort({ _id: 1 })
      .limit(resolvedLimit)
      .lean()
      .exec();

    const data = results.map(RecordResponseDTO.from);
    const hasMore = results.length === resolvedLimit;
    const nextCursor = hasMore
      ? encodeCursor({ _id: results[results.length - 1]._id.toString() })
      : null;

    const page = PaginatedResponseDTO.create(data, nextCursor, hasMore);
    await this.cacheHelper.set(
      cacheKey,
      page,
      RecordService.PAGINATION_CACHE_TTL,
    );
    return page;
  }

  async getTracklistByMbid(mbid?: string): Promise<string[]> {
    const normalizedMbid = mbid?.trim();

    if (!normalizedMbid) {
      return [];
    }

    const cacheKey = `mb:${normalizedMbid}`;
    const cached = await this.cacheHelper.get<string[]>(cacheKey);
    if (cached) {
      this.logger.debug(`Tracklist cache hit for mbid=${normalizedMbid}`);
      return cached;
    }

    const url = `${RecordService.MUSICBRAINZ_RELEASE_URL}/${encodeURIComponent(normalizedMbid)}?inc=recordings&fmt=json`;
    const abortController = new AbortController();
    const timeout = setTimeout(
      () => abortController.abort(),
      RecordService.REQUEST_TIMEOUT_MS,
    );

    this.logger.debug(
      `Fetching tracklist from MusicBrainz for mbid=${normalizedMbid}`,
    );

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'VinylRecordCollectionApp/1.0',
        },
        signal: abortController.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          `MusicBrainz returned ${response.status} for mbid=${normalizedMbid}`,
        );
        if (response.status === 400) {
          throw new BadRequestException(
            `"${normalizedMbid}" is not a valid MusicBrainz ID`,
          );
        }
        if (response.status === 404) {
          throw new NotFoundException(
            `No release found on MusicBrainz for MBID "${normalizedMbid}"`,
          );
        }
        throw new BadGatewayException(
          'Unable to fetch tracklist from MusicBrainz. Please try again later',
        );
      }

      const json = await response.json();
      const tracklist: string[] = [];
      for (const medium of json.media ?? []) {
        for (const track of medium.tracks ?? []) {
          const title = track.title?.trim();
          if (title) {
            tracklist.push(title);
          }
        }
      }

      this.logger.debug(
        `Fetched ${tracklist.length} tracks from MusicBrainz for mbid=${normalizedMbid}`,
      );
      await this.cacheHelper.set(
        cacheKey,
        tracklist,
        RecordService.MB_CACHE_TTL,
      );
      return tracklist;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      if (err instanceof NotFoundException) throw err;
      if (err instanceof BadGatewayException) throw err;
      this.logger.warn(
        `MusicBrainz request failed for mbid=${normalizedMbid}`,
        (err as Error).stack,
      );
      throw new BadGatewayException(
        'Unable to reach MusicBrainz. Please try again later',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
