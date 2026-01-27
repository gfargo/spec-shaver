export interface OpenAPISchema {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths: {
    [path: string]: {
      [method: string]: Operation;
    };
  };
  components?: {
    schemas?: {
      [name: string]: any;
    };
    securitySchemes?: {
      [name: string]: any;
    };
  };
  security?: Array<{
    [name: string]: string[];
  }>;
  tags?: Array<{
    name: string;
    description?: string;
  }>;
}

export interface Operation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: any[];
  requestBody?: any;
  responses?: {
    [statusCode: string]: any;
  };
  security?: Array<{
    [name: string]: string[];
  }>;
}

export interface PrioritizedOperation {
  path: string;
  method: string;
  operation: Operation;
  priority: number;
}

export interface ReducerOptions {
  maxActions?: number;
  maxSizeBytes?: number;
  coreEntities?: string[];
  includeExamples?: boolean;
  maxDescriptionLength?: number;
  methodFilter?: string[]; // Filter to only include specific HTTP methods (e.g., ['get'])
}

export interface ReducerResult {
  schema: OpenAPISchema;
  originalOperationCount: number;
  reducedOperationCount: number;
  sizeBytes: number;
  operations: Array<{
    method: string;
    path: string;
    summary?: string;
  }>;
}
