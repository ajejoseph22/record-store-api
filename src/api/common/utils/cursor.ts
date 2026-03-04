import { Logger } from '@nestjs/common';

const logger = new Logger('Cursor');

export function encodeCursor(fields: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(fields)).toString('base64url');
}

export function decodeCursor(cursor: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString());
  } catch (err) {
    logger.warn(`Failed to decode cursor: ${err}`);
    return null;
  }
}
