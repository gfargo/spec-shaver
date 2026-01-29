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
  private resolveRefs: boolean;
  private readonly HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
  private readonly METHOD_PRIORITIES: { [key: string]: number } = {
    get: 50,
    post: 40,
    patch: 30,
    put: 30,
    delete: 20,
  };

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
    this.methodFilter = options.methodFilter?.map(m => m.toLowerCase());
    this.resolveRefs = options.resolveRefs ?? false;
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

    // Step 3: Resolve $ref references if requested
    if (this.resolveRefs) {
      reducedSchema = this.resolveReferences(reducedSchema);
    }

    // Step 4: Optimize size if needed
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
        if (this.HTTP_METHODS.includes(method.toLowerCase())) {
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
      const pathLower = path.toLowerCase(); // Cache lowercase path
      
      for (const method in schema.paths[path]) {
        const methodLower = method.toLowerCase();
        
        if (!this.HTTP_METHODS.includes(methodLower)) {
          continue;
        }

        // Apply method filter if specified
        if (this.methodFilter && !this.methodFilter.includes(methodLower)) {
          continue;
        }

        const operation = schema.paths[path][method] as Operation;
        const priority = this.calculatePriority(path, pathLower, methodLower, operation);

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
  private calculatePriority(
    path: string,
    pathLower: string,
    methodLower: string,
    operation: Operation
  ): number {
    let priority = 0;

    // Check if path contains core entities (using pre-lowercased path)
    for (const entity of this.coreEntities) {
      if (pathLower.includes(`/${entity}`)) {
        priority += 100;
        break;
      }
    }

    // Prioritize by HTTP method (using lookup table)
    priority += this.METHOD_PRIORITIES[methodLower] || 0;

    // Prioritize collection endpoints (e.g., /companies) over single resource (e.g., /companies/{id})
    priority += path.includes('{') ? 10 : 15;

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
        parameters: schema.components?.parameters,
        responses: schema.components?.responses,
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
    const schemaRefRegex = /#\/components\/schemas\/(.+)/;

    const findRefs = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;

      if (obj.$ref && typeof obj.$ref === 'string') {
        const match = obj.$ref.match(schemaRefRegex);
        if (match && match[1]) {
          const schemaName = match[1];
          if (!visited.has(schemaName)) {
            references.add(schemaName);
            visited.add(schemaName);
            // Recursively find references in this schema
            const referencedSchema = schema.components?.schemas?.[schemaName];
            if (referencedSchema) {
              findRefs(referencedSchema);
            }
          }
        }
        return; // No need to traverse further if we found a $ref
      }

      if (Array.isArray(obj)) {
        for (const item of obj) {
          findRefs(item);
        }
      } else {
        for (const value of Object.values(obj)) {
          findRefs(value);
        }
      }
    };

    findRefs(schema.paths);
    return references;
  }

  /**
   * Optimize schema size by removing unnecessary data
   */
  private optimizeSize(schema: OpenAPISchema): OpenAPISchema {
    // Avoid deep clone if we're already under size limit
    const initialSize = this.calculateSize(schema);
    if (initialSize <= this.maxSizeBytes) {
      return schema;
    }

    // Deep clone only once
    const optimized = this.deepClone(schema);

    // Step 1: Remove examples if not needed
    if (!this.includeExamples) {
      this.removeExamples(optimized);
      
      const sizeAfterExamples = this.calculateSize(optimized);
      if (sizeAfterExamples <= this.maxSizeBytes) {
        return optimized;
      }
    }

    // Step 2: Truncate descriptions
    this.truncateDescriptions(optimized);

    return optimized;
  }

  /**
   * Deep clone an object (faster than JSON.parse(JSON.stringify()))
   */
  private deepClone(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    
    const cloned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }
    return cloned;
  }

  /**
   * Remove example fields from an object (mutates in place)
   */
  private removeExamples(obj: any): void {
    if (!obj || typeof obj !== 'object') return;

    delete obj.example;
    delete obj.examples;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.removeExamples(item);
      }
    } else {
      for (const value of Object.values(obj)) {
        this.removeExamples(value);
      }
    }
  }

  /**
   * Truncate long descriptions (mutates in place)
   */
  private truncateDescriptions(obj: any): void {
    if (!obj || typeof obj !== 'object') return;

    if (obj.description && typeof obj.description === 'string') {
      if (obj.description.length > this.maxDescriptionLength) {
        obj.description = obj.description.substring(0, this.maxDescriptionLength) + '...';
      }
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.truncateDescriptions(item);
      }
    } else {
      for (const value of Object.values(obj)) {
        this.truncateDescriptions(value);
      }
    }
  }

  /**
   * Calculate size of schema in bytes
   */
  private calculateSize(schema: OpenAPISchema): number {
    return Buffer.byteLength(JSON.stringify(schema), 'utf8');
  }

  /**
   * Resolve all $ref references by inlining them
   * This improves compatibility with tools that don't handle references well (e.g., OpenAI GPT)
   */
  public resolveReferences(schema: OpenAPISchema): OpenAPISchema {
    const resolved = this.deepClone(schema);
    
    // Create a map of all component schemas for quick lookup
    const componentSchemas = resolved.components?.schemas || {};
    const componentParameters = resolved.components?.parameters || {};
    const componentResponses = resolved.components?.responses || {};
    
    // Recursively resolve all references
    const resolveRefs = (obj: any, visited: Set<string> = new Set()): any => {
      if (!obj || typeof obj !== 'object') return obj;

      // Handle $ref
      if (obj.$ref && typeof obj.$ref === 'string') {
        const refPath = obj.$ref;
        
        // Prevent circular references
        if (visited.has(refPath)) {
          return { type: 'object', description: `Circular reference to ${refPath}` };
        }
        
        visited.add(refPath);
        
        // Parse the reference
        const match = refPath.match(/#\/components\/(schemas|parameters|responses)\/(.+)/);
        if (match) {
          const [, componentType, componentName] = match;
          let referencedComponent;
          
          if (componentType === 'schemas') {
            referencedComponent = componentSchemas[componentName];
          } else if (componentType === 'parameters') {
            referencedComponent = componentParameters[componentName];
          } else if (componentType === 'responses') {
            referencedComponent = componentResponses[componentName];
          }
          
          if (referencedComponent) {
            // Clone and resolve nested references with the same visited set
            const cloned = this.deepClone(referencedComponent);
            return resolveRefs(cloned, visited);
          }
        }
        
        // If we can't resolve, return the original reference
        return obj;
      }

      // Handle arrays
      if (Array.isArray(obj)) {
        return obj.map(item => resolveRefs(item, visited));
      }

      // Handle objects
      const result: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          result[key] = resolveRefs(obj[key], visited);
        }
      }
      return result;
    };

    // Resolve references in paths (but skip parameter refs)
    if (resolved.paths) {
      const resolvedPaths: any = {};
      for (const path in resolved.paths) {
        resolvedPaths[path] = {};
        for (const method in resolved.paths[path]) {
          const operation = resolved.paths[path][method];
          resolvedPaths[path][method] = {
            ...operation,
            // Keep parameters as-is (they should remain as refs)
            parameters: operation.parameters,
            // Resolve refs in responses
            responses: operation.responses ? resolveRefs(operation.responses, new Set()) : operation.responses,
            // Resolve refs in requestBody
            requestBody: operation.requestBody ? resolveRefs(operation.requestBody, new Set()) : operation.requestBody,
          };
        }
      }
      resolved.paths = resolvedPaths;
    }

    // Also resolve references in components schemas
    if (resolved.components?.schemas) {
      const resolvedSchemas: any = {};
      for (const schemaName in resolved.components.schemas) {
        resolvedSchemas[schemaName] = resolveRefs(resolved.components.schemas[schemaName], new Set());
      }
      resolved.components.schemas = resolvedSchemas;
    }

    // After resolving all references, we can optionally remove the components section
    // to create a fully self-contained schema (uncomment if desired)
    // delete resolved.components?.schemas;
    // delete resolved.components?.parameters;
    // delete resolved.components?.responses;

    return resolved;
  }
}
