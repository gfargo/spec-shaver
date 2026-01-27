import {
    OpenAPISchema,
    Operation,
    PrioritizedOperation,
    ReducerOptions,
    ReducerResult,
} from './types';

export class OpenAPIReducer {
  private maxActions: number;
  private maxSizeBytes: number;
  private coreEntities: string[];
  private includeExamples: boolean;
  private maxDescriptionLength: number;
  private methodFilter?: string[];

  constructor(options: ReducerOptions = {}) {
    this.maxActions = options.maxActions ?? 30;
    this.maxSizeBytes = options.maxSizeBytes ?? 1024 * 1024; // 1MB default
    this.coreEntities = options.coreEntities ?? [
      'users',
      'accounts',
      'organizations',
      'projects',
      'items',
      'resources',
      'events',
      'messages',
      'files',
      'settings',
    ];
    this.includeExamples = options.includeExamples ?? false;
    this.maxDescriptionLength = options.maxDescriptionLength ?? 200;
    this.methodFilter = options.methodFilter;
  }

  /**
   * Reduce an OpenAPI schema to specified number of operations and size
   */
  public reduce(schema: OpenAPISchema): ReducerResult {
    const originalOperationCount = this.countOperations(schema);

    // Step 1: Prioritize and select top operations
    const prioritizedOps = this.prioritizeOperations(schema);
    const selectedOps = prioritizedOps.slice(0, this.maxActions);

    // Step 2: Build reduced schema with selected operations
    let reducedSchema = this.buildReducedSchema(schema, selectedOps);

    // Step 3: Optimize size if needed
    reducedSchema = this.optimizeSize(reducedSchema);

    const sizeBytes = this.calculateSize(reducedSchema);
    const operations = selectedOps.map(op => ({
      method: op.method.toUpperCase(),
      path: op.path,
      summary: op.operation.summary,
    }));

    return {
      schema: reducedSchema,
      originalOperationCount,
      reducedOperationCount: this.countOperations(reducedSchema),
      sizeBytes,
      operations,
    };
  }

  /**
   * Count total operations in schema
   */
  private countOperations(schema: OpenAPISchema): number {
    let count = 0;
    for (const path in schema.paths) {
      for (const method in schema.paths[path]) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Prioritize operations based on entity importance and operation type
   */
  private prioritizeOperations(schema: OpenAPISchema): PrioritizedOperation[] {
    const operations: PrioritizedOperation[] = [];

    for (const path in schema.paths) {
      for (const method in schema.paths[path]) {
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) {
          continue;
        }

        // Apply method filter if specified
        if (this.methodFilter && this.methodFilter.length > 0) {
          if (!this.methodFilter.includes(method.toLowerCase())) {
            continue;
          }
        }

        const operation = schema.paths[path][method] as Operation;
        const priority = this.calculatePriority(path, method, operation);

        operations.push({
          path,
          method,
          operation,
          priority,
        });
      }
    }

    // Sort by priority descending
    return operations.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Calculate priority score for an operation
   */
  private calculatePriority(path: string, method: string, operation: Operation): number {
    let priority = 0;

    // Check if path contains core entities
    const pathLower = path.toLowerCase();
    for (const entity of this.coreEntities) {
      if (pathLower.includes(`/${entity}`)) {
        priority += 100;
        break;
      }
    }

    // Prioritize by HTTP method
    const methodLower = method.toLowerCase();
    if (methodLower === 'get') priority += 50;
    else if (methodLower === 'post') priority += 40;
    else if (methodLower === 'patch' || methodLower === 'put') priority += 30;
    else if (methodLower === 'delete') priority += 20;

    // Prioritize collection endpoints (e.g., /companies) over single resource (e.g., /companies/{id})
    if (!path.includes('{')) {
      priority += 15;
    } else {
      priority += 10;
    }

    // Boost if operation has a clear summary
    if (operation.summary && operation.summary.length > 10) {
      priority += 5;
    }

    return priority;
  }

  /**
   * Build a reduced schema with only selected operations
   */
  private buildReducedSchema(
    schema: OpenAPISchema,
    selectedOps: PrioritizedOperation[]
  ): OpenAPISchema {
    const reducedSchema: OpenAPISchema = {
      openapi: schema.openapi,
      info: schema.info,
      servers: schema.servers,
      paths: {},
      components: {
        schemas: {},
        securitySchemes: schema.components?.securitySchemes,
      },
      security: schema.security,
      tags: schema.tags,
    };

    // Add selected operations to paths
    for (const op of selectedOps) {
      if (!reducedSchema.paths[op.path]) {
        reducedSchema.paths[op.path] = {};
      }
      reducedSchema.paths[op.path][op.method] = op.operation;
    }

    // Include all referenced schemas
    const referencedSchemas = this.findReferencedSchemas(reducedSchema);
    if (schema.components?.schemas) {
      for (const schemaName of referencedSchemas) {
        if (schema.components.schemas[schemaName]) {
          reducedSchema.components!.schemas![schemaName] = schema.components.schemas[schemaName];
        }
      }
    }

    return reducedSchema;
  }

  /**
   * Find all schema references in the reduced schema
   */
  private findReferencedSchemas(schema: OpenAPISchema): Set<string> {
    const references = new Set<string>();
    const visited = new Set<string>();

    const findRefs = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;

      if (obj.$ref && typeof obj.$ref === 'string') {
        const match = obj.$ref.match(/#\/components\/schemas\/(.+)/);
        if (match && match[1]) {
          const schemaName = match[1];
          if (!visited.has(schemaName)) {
            references.add(schemaName);
            visited.add(schemaName);
            // Recursively find references in this schema
            if (schema.components?.schemas?.[schemaName]) {
              findRefs(schema.components.schemas[schemaName]);
            }
          }
        }
      }

      if (Array.isArray(obj)) {
        obj.forEach(item => findRefs(item));
      } else {
        Object.values(obj).forEach(value => findRefs(value));
      }
    };

    findRefs(schema.paths);
    return references;
  }

  /**
   * Optimize schema size by removing unnecessary data
   */
  private optimizeSize(schema: OpenAPISchema): OpenAPISchema {
    const optimized = JSON.parse(JSON.stringify(schema)); // Deep clone

    // Check size and optimize if needed
    let currentSize = this.calculateSize(optimized);

    if (currentSize <= this.maxSizeBytes) {
      return optimized;
    }

    // Step 1: Remove examples from components
    if (!this.includeExamples && optimized.components?.schemas) {
      for (const schemaName in optimized.components.schemas) {
        this.removeExamples(optimized.components.schemas[schemaName]);
      }
    }

    currentSize = this.calculateSize(optimized);
    if (currentSize <= this.maxSizeBytes) {
      return optimized;
    }

    // Step 2: Remove examples from paths
    if (!this.includeExamples) {
      for (const path in optimized.paths) {
        for (const method in optimized.paths[path]) {
          this.removeExamples(optimized.paths[path][method]);
        }
      }
    }

    currentSize = this.calculateSize(optimized);
    if (currentSize <= this.maxSizeBytes) {
      return optimized;
    }

    // Step 3: Truncate descriptions
    this.truncateDescriptions(optimized);

    return optimized;
  }

  /**
   * Remove example fields from an object
   */
  private removeExamples(obj: any): void {
    if (!obj || typeof obj !== 'object') return;

    delete obj.example;
    delete obj.examples;

    if (Array.isArray(obj)) {
      obj.forEach(item => this.removeExamples(item));
    } else {
      Object.values(obj).forEach(value => this.removeExamples(value));
    }
  }

  /**
   * Truncate long descriptions
   */
  private truncateDescriptions(obj: any): void {
    if (!obj || typeof obj !== 'object') return;

    if (obj.description && typeof obj.description === 'string') {
      if (obj.description.length > this.maxDescriptionLength) {
        obj.description = obj.description.substring(0, this.maxDescriptionLength) + '...';
      }
    }

    if (Array.isArray(obj)) {
      obj.forEach(item => this.truncateDescriptions(item));
    } else {
      Object.values(obj).forEach(value => this.truncateDescriptions(value));
    }
  }

  /**
   * Calculate size of schema in bytes
   */
  private calculateSize(schema: OpenAPISchema): number {
    return Buffer.byteLength(JSON.stringify(schema), 'utf8');
  }
}
