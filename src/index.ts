export { OpenAPIReducer } from './reducer';
export { SchemaFetcher } from './fetcher';
export { runWizard, extractOperationGroups, buildSchemaFromSelections } from './wizard';
export { logger } from './logger';
export { loadConfig, mergeConfig, createDefaultConfig } from './config';
export { validateSchema, validateSchemaOrThrow } from './validator';
export type {
  OpenAPISchema,
  Operation,
  PrioritizedOperation,
  ReducerOptions,
  ReducerResult,
} from './types';
export type { FetchOptions } from './fetcher';
export type { OperationInfo, OperationGroup } from './wizard';
export type { ConfigFile } from './config';
export type { ValidationResult } from './validator';
export type { LogLevel } from './logger';

// Convenience functions
import { OpenAPIReducer } from './reducer';
import { SchemaFetcher, FetchOptions } from './fetcher';
import { ReducerOptions } from './types';

/**
 * Fetch and reduce an OpenAPI schema from a URL
 */
export async function reduceFromURL(
  url: string,
  options?: ReducerOptions & { headers?: FetchOptions['headers'] }
) {
  const schema = await SchemaFetcher.fetch({ url, headers: options?.headers });
  const reducer = new OpenAPIReducer(options);
  return reducer.reduce(schema);
}
