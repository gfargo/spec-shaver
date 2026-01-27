import axios from 'axios';
import { OpenAPISchema } from './types';

export interface FetchOptions {
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export class SchemaFetcher {
  /**
   * Fetch OpenAPI schema from a URL
   */
  public static async fetch(options: FetchOptions): Promise<OpenAPISchema> {
    const { url, headers = {}, timeout = 30000 } = options;

    try {
      const response = await axios.get<OpenAPISchema>(url, {
        timeout,
        headers: {
          Accept: 'application/json',
          ...headers,
        },
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          throw new Error(
            `Failed to fetch schema: ${error.response.status} ${error.response.statusText}`
          );
        } else if (error.request) {
          throw new Error('Failed to fetch schema: No response received from server');
        }
      }
      throw new Error(`Failed to fetch schema: ${error}`);
    }
  }
}
