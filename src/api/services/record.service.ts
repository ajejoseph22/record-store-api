import { Injectable } from '@nestjs/common';

@Injectable()
export class RecordService {
  private static readonly MUSICBRAINZ_RELEASE_URL =
    'https://musicbrainz.org/ws/2/release';
  private static readonly REQUEST_TIMEOUT_MS = 5000;

  async getTracklistByMbid(mbid?: string): Promise<string[]> {
    const normalizedMbid = mbid?.trim();
    if (!normalizedMbid) {
      return [];
    }

    const url = `${RecordService.MUSICBRAINZ_RELEASE_URL}/${encodeURIComponent(normalizedMbid)}?inc=recordings&fmt=xml`;
    const abortController = new AbortController();
    const timeout = setTimeout(
      () => abortController.abort(),
      RecordService.REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/xml' },
        signal: abortController.signal,
      });
      if (!response.ok) {
        return [];
      }

      const xmlBody = await response.text();
      return this.extractTrackTitles(xmlBody);
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractTrackTitles(xmlBody: string): string[] {
    const trackNodes = xmlBody.match(/<track\b[\s\S]*?<\/track>/gi) ?? [];

    return trackNodes
      .map((trackNode) => {
        const titleMatch = trackNode.match(/<title>([\s\S]*?)<\/title>/i);
        if (!titleMatch) {
          return '';
        }

        return this.decodeXmlEntities(titleMatch[1]).trim();
      })
      .filter((title) => title.length > 0);
  }

  private decodeXmlEntities(value: string): string {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#x([0-9A-Fa-f]+);/g, (_, hexCode: string) =>
        String.fromCodePoint(Number.parseInt(hexCode, 16)),
      )
      .replace(/&#([0-9]+);/g, (_, decimalCode: string) =>
        String.fromCodePoint(Number.parseInt(decimalCode, 10)),
      );
  }
}
