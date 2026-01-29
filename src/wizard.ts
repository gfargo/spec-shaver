import inquirer from 'inquirer';
import { OpenAPISchema, Operation, ReducerOptions, ReducerResult } from './types';
import { logger } from './logger';
import { OpenAPIReducer } from './reducer';

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

interface WizardState {
  mode?: 'groups' | 'individual' | 'all';
  selectedTags?: string[];
  selectedOperations?: OperationInfo[];
  refine?: boolean;
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
      parameters: originalSchema.components?.parameters,
      responses: originalSchema.components?.responses,
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

  // Resolve references if requested
  let finalSchema = reducedSchema;
  if (options.resolveRefs) {
    logger.verbose('Resolving $ref references...');
    const reducer = new OpenAPIReducer(options);
    finalSchema = reducer.resolveReferences(reducedSchema);
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

  const sizeBytes = Buffer.byteLength(JSON.stringify(finalSchema), 'utf8');

  return {
    schema: finalSchema,
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

  logger.log(`\nFound ${totalOperations} operations in ${groups.length} groups:\n`);

  const state: WizardState = {};
  let step = 1;

  // Step 1: Select mode
  while (step === 1) {
    const { mode, action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: 'How would you like to select operations? (Ctrl+C to exit)',
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
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { value: 'continue', name: 'Continue' },
        ],
        when: (answers: any) => answers.mode !== undefined,
      },
    ]);

    state.mode = mode;
    step = 2;
  }

  let selectedOperations: OperationInfo[] = [];

  if (state.mode === 'all') {
    selectedOperations = groups.flatMap((g) => g.operations);
  } else if (state.mode === 'groups') {
    // Steps 2-4: Group selection with refinement
    while (step >= 2 && step <= 4) {
      if (step === 2) {
        // Step 2: Select groups
        const { selectedTags, action } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selectedTags',
            message: 'Select groups to include (space to toggle, enter to confirm):',
            choices: groups.map((g) => ({
              value: g.tag,
              name: `${g.tag} (${g.operations.length} operations)`,
              checked: state.selectedTags?.includes(g.tag) || false,
            })),
            pageSize: 15,
          },
          {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
              { value: 'continue', name: 'Continue' },
              { value: 'back', name: 'Go back' },
            ],
          },
        ]);

        if (action === 'back') {
          step = 1;
          continue;
        }

        if (selectedTags.length === 0) {
          logger.warn('No groups selected. Please select at least one group or go back.');
          continue;
        }

        state.selectedTags = selectedTags;
        step = 3;
      } else if (step === 3) {
        // Step 3: Optionally refine within groups
        const selectedGroups = groups.filter((g) => state.selectedTags!.includes(g.tag));
        const operationCount = selectedGroups.flatMap((g) => g.operations).length;

        const { refine, action } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'refine',
            message: `Selected ${operationCount} operations. Would you like to refine individual operations within these groups?`,
            default: state.refine ?? false,
          },
          {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
              { value: 'continue', name: 'Continue' },
              { value: 'back', name: 'Go back' },
            ],
          },
        ]);

        if (action === 'back') {
          step = 2;
          continue;
        }

        state.refine = refine;

        if (refine) {
          step = 4;
        } else {
          selectedOperations = selectedGroups.flatMap((g) => g.operations);
          step = 5;
        }
      } else if (step === 4) {
        // Step 4: Refine individual operations
        const refinedOperations: OperationInfo[] = [];
        const selectedGroups = groups.filter((g) => state.selectedTags!.includes(g.tag));

        for (const group of selectedGroups) {
          logger.log(`\n${logger.formatOperation('', `--- ${group.tag} ---`, '')}`);
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

        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
              { value: 'continue', name: 'Continue' },
              { value: 'back', name: 'Go back' },
            ],
          },
        ]);

        if (action === 'back') {
          step = 3;
          continue;
        }

        selectedOperations = refinedOperations;
        step = 5;
      }
    }
  } else {
    // Individual mode - select operations one by one
    for (const group of groups) {
      logger.log(`\n${logger.formatOperation('', `--- ${group.tag} ---`, '')}`);
      const { selected } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selected',
          message: `Select operations from ${group.tag} (Ctrl+C to exit):`,
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
    logger.warn('No operations selected. Exiting.');
    process.exit(0);
  }

  // Build the result
  logger.verbose('Building reduced schema from selections...');
  const result = buildSchemaFromSelections(schema, selectedOperations, options);

  // Show summary
  logger.separator();
  logger.log(logger.formatOperation('', 'SELECTION SUMMARY', ''));
  logger.separator();
  logger.log(`Operations: ${result.originalOperationCount} → ${result.reducedOperationCount}`);
  logger.log(`Estimated size: ${logger.formatBytes(result.sizeBytes)}`);
  logger.separator();

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
    logger.warn('Cancelled.');
    process.exit(0);
  }

  return result;
}
