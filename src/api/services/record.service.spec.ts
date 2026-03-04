import { RecordService } from './record.service';

describe('RecordService', () => {
  let service: RecordService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new RecordService();
    fetchMock = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

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
});
