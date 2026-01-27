import inquirer from 'inquirer';
import { OpenAPISchema, Operation, ReducerOptions, ReducerResult } from './types';

export interface OperationInfo {
  path: string;
  method: string;
  operation: Operation;
  tag: string;
  displayName: string;
}

export interface OperationGroup {
  tag: string;
  operations: OperationInfo[];
}

/**
 * Extract and group all operations from an OpenAPI schema
 */
export function extractOperationGroups(schema: OpenAPISchema): OperationGroup[] {
  const operationsByTag = new Map<string, OperationInfo[]>();
  const httpMethods = ['get', 'post', 'put', 'patch', 'delete'];

  for (const path in schema.paths) {
    for (const method of httpMethods) {
      const operation = schema.paths[path][method] as Operation | undefined;
      if (!operation) continue;

      // Get tag from operation, or derive from path
      const tag = operation.tags?.[0] || deriveTagFromPath(path);

      const info: OperationInfo = {
        path,
        method: method.toUpperCase(),
        operation,
        tag,
        displayName: `${method.toUpperCase().padEnd(7)} ${path}`,
      };

      if (!operationsByTag.has(tag)) {
        operationsByTag.set(tag, []);
      }
      operationsByTag.get(tag)!.push(info);
    }
  }

  // Convert to array and sort by tag name
  const groups: OperationGroup[] = [];
  for (const [tag, operations] of operationsByTag) {
    groups.push({
      tag,
      operations: operations.sort((a, b) => {
        // Sort by path, then by method order
        const pathCompare = a.path.localeCompare(b.path);
        if (pathCompare !== 0) return pathCompare;
        const methodOrder = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
        return methodOrder.indexOf(a.method) - methodOrder.indexOf(b.method);
      }),
    });
  }

  return groups.sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * Derive a tag name from a path (e.g., "/users/{id}" -> "users")
 */
function deriveTagFromPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return 'root';

  // Get first non-parameter part
  for (const part of parts) {
    if (!part.startsWith('{')) {
      return part;
    }
  }
  return parts[0].replace(/[{}]/g, '');
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Build a reduced schema from selected operations
 */
export function buildSchemaFromSelections(
  originalSchema: OpenAPISchema,
  selectedOperations: OperationInfo[],
  options: ReducerOptions = {}
): ReducerResult {
  const includeExamples = options.includeExamples ?? false;

  // Build the reduced schema
  const reducedSchema: OpenAPISchema = {
    openapi: originalSchema.openapi,
    info: originalSchema.info,
    servers: originalSchema.servers,
    paths: {},
    components: {
      schemas: {},
      securitySchemes: originalSchema.components?.securitySchemes,
    },
    security: originalSchema.security,
    tags: originalSchema.tags,
  };

  // Add selected operations to paths
  for (const op of selectedOperations) {
    if (!reducedSchema.paths[op.path]) {
      reducedSchema.paths[op.path] = {};
    }
    reducedSchema.paths[op.path][op.method.toLowerCase()] = op.operation;
  }

  // Find and include all referenced schemas
  const referencedSchemas = findReferencedSchemas(reducedSchema, originalSchema);
  if (originalSchema.components?.schemas) {
    for (const schemaName of referencedSchemas) {
      if (originalSchema.components.schemas[schemaName]) {
        reducedSchema.components!.schemas![schemaName] =
          originalSchema.components.schemas[schemaName];
      }
    }
  }

  // Optimize if needed
  if (!includeExamples) {
    removeExamples(reducedSchema);
  }

  // Calculate original operation count
  let originalOperationCount = 0;
  for (const path in originalSchema.paths) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      if (originalSchema.paths[path][method]) {
        originalOperationCount++;
      }
    }
  }

  const sizeBytes = Buffer.byteLength(JSON.stringify(reducedSchema), 'utf8');

  return {
    schema: reducedSchema,
    originalOperationCount,
    reducedOperationCount: selectedOperations.length,
    sizeBytes,
    operations: selectedOperations.map((op) => ({
      method: op.method,
      path: op.path,
      summary: op.operation.summary,
    })),
  };
}

/**
 * Find all schema references recursively
 */
function findReferencedSchemas(
  schema: OpenAPISchema,
  originalSchema: OpenAPISchema
): Set<string> {
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
          if (originalSchema.components?.schemas?.[schemaName]) {
            findRefs(originalSchema.components.schemas[schemaName]);
          }
        }
      }
    }

    if (Array.isArray(obj)) {
      obj.forEach((item) => findRefs(item));
    } else {
      Object.values(obj).forEach((value) => findRefs(value));
    }
  };

  findRefs(schema.paths);
  return references;
}

/**
 * Remove example fields from schema
 */
function removeExamples(obj: any): void {
  if (!obj || typeof obj !== 'object') return;

  delete obj.example;
  delete obj.examples;

  if (Array.isArray(obj)) {
    obj.forEach((item) => removeExamples(item));
  } else {
    Object.values(obj).forEach((value) => removeExamples(value));
  }
}

/**
 * Interactive wizard for selecting operations
 */
export async function runWizard(
  schema: OpenAPISchema,
  options: ReducerOptions = {}
): Promise<ReducerResult> {
  const groups = extractOperationGroups(schema);
  const totalOperations = groups.reduce((sum, g) => sum + g.operations.length, 0);

  console.log(`\nFound ${totalOperations} operations in ${groups.length} groups:\n`);

  // Step 1: Select mode
  const { mode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: 'How would you like to select operations?',
      choices: [
        {
          value: 'groups',
          name: 'Select by groups/tags (recommended) - Choose entire groups of related endpoints',
        },
        {
          value: 'individual',
          name: 'Select individual operations - Pick specific endpoints one by one',
        },
        {
          value: 'all',
          name: 'Keep all operations - Include everything (only optimize size)',
        },
      ],
    },
  ]);

  let selectedOperations: OperationInfo[] = [];

  if (mode === 'all') {
    selectedOperations = groups.flatMap((g) => g.operations);
  } else if (mode === 'groups') {
    // Step 2a: Select groups
    const { selectedTags } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedTags',
        message: 'Select groups to include (space to toggle, enter to confirm):',
        choices: groups.map((g) => ({
          value: g.tag,
          name: `${g.tag} (${g.operations.length} operations)`,
          checked: false,
        })),
        pageSize: 15,
      },
    ]);

    if (selectedTags.length === 0) {
      console.log('\nNo groups selected. Exiting.');
      process.exit(0);
    }

    // Get all operations from selected groups
    const selectedGroups = groups.filter((g) => selectedTags.includes(g.tag));
    selectedOperations = selectedGroups.flatMap((g) => g.operations);

    // Step 3: Optionally refine within groups
    const { refine } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'refine',
        message: `Selected ${selectedOperations.length} operations. Would you like to refine individual operations within these groups?`,
        default: false,
      },
    ]);

    if (refine) {
      const refinedOperations: OperationInfo[] = [];

      for (const group of selectedGroups) {
        console.log(`\n--- ${group.tag} ---`);
        const { selected } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selected',
            message: `Select operations from ${group.tag}:`,
            choices: group.operations.map((op) => ({
              value: op,
              name: `${op.method.padEnd(7)} ${op.path}${op.operation.summary ? ` - ${op.operation.summary}` : ''}`,
              checked: true,
            })),
            pageSize: 15,
          },
        ]);
        refinedOperations.push(...selected);
      }
      selectedOperations = refinedOperations;
    }
  } else {
    // Step 2b: Select individual operations
    for (const group of groups) {
      console.log(`\n--- ${group.tag} ---`);
      const { selected } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selected',
          message: `Select operations from ${group.tag}:`,
          choices: group.operations.map((op) => ({
            value: op,
            name: `${op.method.padEnd(7)} ${op.path}${op.operation.summary ? ` - ${op.operation.summary}` : ''}`,
            checked: false,
          })),
          pageSize: 15,
        },
      ]);
      selectedOperations.push(...selected);
    }
  }

  if (selectedOperations.length === 0) {
    console.log('\nNo operations selected. Exiting.');
    process.exit(0);
  }

  // Build the result
  const result = buildSchemaFromSelections(schema, selectedOperations, options);

  // Show summary
  console.log('\n' + '='.repeat(60));
  console.log('SELECTION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Operations: ${result.originalOperationCount} → ${result.reducedOperationCount}`);
  console.log(`Estimated size: ${formatBytes(result.sizeBytes)}`);
  console.log('='.repeat(60));

  // Confirm
  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: 'Generate reduced schema with these selections?',
      default: true,
    },
  ]);

  if (!proceed) {
    console.log('\nCancelled.');
    process.exit(0);
  }

  return result;
}
