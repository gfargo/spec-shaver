import OpenAPISchemaValidator from 'openapi-schema-validator';
import { OpenAPISchema } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate an OpenAPI schema
 */
export function validateSchema(schema: OpenAPISchema): ValidationResult {
  try {
    const validator = new OpenAPISchemaValidator({ version: 3 });
    const result = validator.validate(schema);

    if (result.errors.length === 0) {
      return { valid: true, errors: [] };
    }

    return {
      valid: false,
      errors: result.errors.map((err: any) => {
        if (typeof err === 'string') return err;
        return err.message || JSON.stringify(err);
      }),
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Validate and throw if invalid
 */
export function validateSchemaOrThrow(schema: OpenAPISchema, context: string = 'Schema'): void {
  const result = validateSchema(schema);
  if (!result.valid) {
    throw new Error(
      `${context} validation failed:\n${result.errors.map((e) => `  - ${e}`).join('\n')}`
    );
  }
}
