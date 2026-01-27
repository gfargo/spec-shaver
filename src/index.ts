export { OpenAPIReducer } from './reducer';
export { SchemaFetcher } from './fetcher';
export {
  runWizard,
  extractOperationGroups,
  buildSchemaFromSelections,
} from './wizard';
export type {
  OpenAPISchema,
  Operation,
  PrioritizedOperation,
  ReducerOptions,
  ReducerResult,
} from './types';
export type { FetchOptions } from './fetcher';
export type { OperationInfo, OperationGroup } from './wizard';

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
