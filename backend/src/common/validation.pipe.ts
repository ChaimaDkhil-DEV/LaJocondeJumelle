import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { AppException } from './errors';

interface FieldError {
  field: string;
  messages: string[];
}

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, messages: Object.values(error.constraints) }] : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/** DTO en liste blanche : tout champ inconnu ou invalide → 400 VALIDATION_ERROR avec la liste des champs. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new AppException('VALIDATION_ERROR', { fields: flatten(errors) }),
  });
}
