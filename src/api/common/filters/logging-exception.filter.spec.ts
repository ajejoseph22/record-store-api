import {
  ArgumentsHost,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { LoggingExceptionFilter } from './logging-exception.filter';

describe('LoggingExceptionFilter', () => {
  let filter: LoggingExceptionFilter;
  let loggerErrorSpy: jest.SpyInstance;
  let superCatchSpy: jest.SpyInstance;

  const mockHost = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', url: '/records' }),
      getResponse: () => ({}),
    }),
  } as unknown as ArgumentsHost;

  beforeEach(() => {
    filter = new LoggingExceptionFilter();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    superCatchSpy = jest
      .spyOn(BaseExceptionFilter.prototype, 'catch')
      .mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should log and delegate for 500-level HttpException', () => {
    const exception = new InternalServerErrorException('Something broke');

    filter.catch(exception, mockHost);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/records',
        statusCode: 500,
        message: 'Something broke',
        stack: expect.any(String),
      }),
    );
    expect(superCatchSpy).toHaveBeenCalledWith(exception, mockHost);
  });

  it('should log and delegate for non-HttpException (plain Error)', () => {
    const exception = new Error('Unexpected failure');

    filter.catch(exception, mockHost);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/records',
        statusCode: 500,
        message: 'Unexpected failure',
        stack: exception.stack,
      }),
    );
    expect(superCatchSpy).toHaveBeenCalledWith(exception, mockHost);
  });

  it('should log and delegate for non-Error thrown value (string)', () => {
    const exception = 'raw string error';

    filter.catch(exception, mockHost);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/records',
        statusCode: 500,
        message: 'raw string error',
        stack: undefined,
      }),
    );
    expect(superCatchSpy).toHaveBeenCalledWith(exception, mockHost);
  });

  it('should NOT log for 4xx HttpException but still delegate', () => {
    const exception = new NotFoundException('Not found');

    filter.catch(exception, mockHost);

    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(superCatchSpy).toHaveBeenCalledWith(exception, mockHost);
  });
});
