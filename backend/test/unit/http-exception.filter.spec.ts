import { ArgumentsHost, BadRequestException, ForbiddenException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AppException } from '../../src/common/errors';
import { HttpExceptionFilter } from '../../src/common/http-exception.filter';
import { createValidationPipe } from '../../src/common/validation.pipe';
import { IsString, MaxLength } from 'class-validator';

function hostWithResponse() {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ url: '/api/x', method: 'GET' }) }),
    getType: () => 'http',
  } as unknown as ArgumentsHost;
  return { host, response };
}

function body(response: { json: jest.Mock }) {
  return response.json.mock.calls[0][0];
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('renvoie le code métier, le message français et les détails d’une AppException', () => {
    const { host, response } = hostWithResponse();
    filter.catch(new AppException('INVALID_TRANSITION', { status: 'CLOSED' }), host);
    expect(response.status).toHaveBeenCalledWith(409);
    expect(body(response)).toEqual({
      error: {
        code: 'INVALID_TRANSITION',
        message: expect.stringMatching(/statut/),
        details: { status: 'CLOSED' },
      },
    });
  });

  it.each([
    [new NotFoundException(), 404, 'NOT_FOUND'],
    [new UnauthorizedException(), 401, 'UNAUTHENTICATED'],
    [new ForbiddenException(), 403, 'FORBIDDEN'],
    [new ThrottlerException(), 429, 'RATE_LIMITED'],
    [new BadRequestException(), 400, 'VALIDATION_ERROR'],
  ])('traduit %p en %i %s', (exception, status, code) => {
    const { host, response } = hostWithResponse();
    filter.catch(exception, host);
    expect(response.status).toHaveBeenCalledWith(status);
    expect(body(response).error.code).toBe(code);
    expect(typeof body(response).error.message).toBe('string');
  });

  it('masque les erreurs inattendues derrière une 500 générique', () => {
    const { host, response } = hostWithResponse();
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter.catch(new Error('détail interne SQL'), host);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(body(response).error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body(response))).not.toContain('SQL');
    expect(logged).toHaveBeenCalled();
  });
});

class SampleDto {
  @IsString()
  @MaxLength(5)
  title!: string;
}

describe('createValidationPipe', () => {
  const pipe = createValidationPipe();
  const meta = { type: 'body' as const, metatype: SampleDto };

  it('rejette les champs inconnus et invalides avec VALIDATION_ERROR et la liste des champs', async () => {
    await expect(pipe.transform({ title: 'beaucoup trop long', intrus: 1 }, meta)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { fields: expect.arrayContaining([expect.objectContaining({ field: 'title' }), expect.objectContaining({ field: 'intrus' })]) },
    });
  });

  it('accepte un corps valide', async () => {
    await expect(pipe.transform({ title: 'ok' }, meta)).resolves.toBeInstanceOf(SampleDto);
  });
});
