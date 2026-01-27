#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { OpenAPIReducer } from './reducer';
import { SchemaFetcher } from './fetcher';
import { OpenAPISchema } from './types';
import { runWizard } from './wizard';
import { logger } from './logger';
import { loadConfig, mergeConfig, createDefaultConfig } from './config';
import { validateSchemaOrThrow } from './validator';

/**
 * Parse method filter from CLI options
 */
function parseMethodFilter(methods?: string): string[] | undefined {
  if (!methods) return undefined;
  return methods.split(',').map((m) => m.trim().toLowerCase());
}

const program = new Command();

program
  .name('spec-shaver')
  .description('Intelligently reduce OpenAPI schemas to a specified number of operations and size')
  .version('1.1.0')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-q, --quiet', 'Suppress all output except errors')
  .option('-c, --config <file>', 'Path to config file')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.quiet) {
      logger.setLevel('quiet');
    } else if (opts.verbose) {
      logger.setLevel('verbose');
    }
  });

program
  .command('init')
  .description('Create a default configuration file')
  .option('-o, --output <file>', 'Config file path', '.spec-shaver.json')
  .action((options) => {
    try {
      if (fs.existsSync(options.output)) {
        logger.warn(`Config file already exists: ${options.output}`);
        process.exit(1);
      }

      createDefaultConfig(options.output);
      logger.success(`Created config file: ${options.output}`);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('fetch')
  .description('Fetch and reduce an OpenAPI schema from a URL')
  .requiredOption('-u, --url <url>', 'URL to fetch OpenAPI schema from')
  .option('-H, --header <header...>', 'HTTP headers (format: "Key: Value")')
  .option('-o, --output <file>', 'Output file path', 'reduced_schema.json')
  .option('-a, --actions <number>', 'Maximum number of actions', '30')
  .option('-s, --size <bytes>', 'Maximum size in bytes', String(1024 * 1024))
  .option('-m, --methods <methods>', 'Filter by HTTP methods (comma-separated, e.g., "get,post")')
  .option('--include-examples', 'Include examples in schema', false)
  .action(async (options) => {
    try {
      // Load and merge config
      const globalOpts = program.opts();
      const config = loadConfig(globalOpts.config);
      const mergedOptions = mergeConfig(options, config);

      logger.verbose('Starting fetch command...');
      logger.startSpinner(`Fetching schema from ${mergedOptions.url}...`);

      // Parse headers from command line
      const headers: Record<string, string> = {};
      if (mergedOptions.header) {
        for (const h of mergedOptions.header) {
          const colonIndex = h.indexOf(':');
          if (colonIndex > 0) {
            const key = h.substring(0, colonIndex).trim();
            const value = h.substring(colonIndex + 1).trim();
            headers[key] = value;
            logger.verbose(`Added header: ${key}`);
          }
        }
      }

      const schema = await SchemaFetcher.fetch({ url: mergedOptions.url, headers });
      logger.succeedSpinner('Schema fetched successfully');

      const originalSize = Buffer.byteLength(JSON.stringify(schema), 'utf8');
      logger.info(`Original schema size: ${logger.formatBytes(originalSize)}`);

      // Validate original schema
      logger.verbose('Validating original schema...');
      try {
        validateSchemaOrThrow(schema, 'Original schema');
        logger.verbose('Original schema is valid');
      } catch (error) {
        logger.warn('Original schema validation failed, continuing anyway...');
        logger.verbose(error instanceof Error ? error.message : String(error));
      }

      logger.startSpinner(`Reducing schema to ${mergedOptions.actions} operations...`);
      
      const methodFilter = parseMethodFilter(mergedOptions.methods);
      if (methodFilter) {
        logger.verbose(`Filtering to methods: ${methodFilter.join(', ')}`);
      }
      
      const reducer = new OpenAPIReducer({
        maxActions: parseInt(mergedOptions.actions),
        maxSizeBytes: parseInt(mergedOptions.size),
        includeExamples: mergedOptions.includeExamples,
        coreEntities: mergedOptions.coreEntities,
        maxDescriptionLength: mergedOptions.maxDescriptionLength,
        methodFilter,
      });

      const result = reducer.reduce(schema);
      logger.succeedSpinner('Schema reduced successfully');

      // Validate reduced schema
      logger.verbose('Validating reduced schema...');
      try {
        validateSchemaOrThrow(result.schema, 'Reduced schema');
        logger.success('Reduced schema is valid');
      } catch (error) {
        logger.error('Reduced schema validation failed!');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }

      // Save to file
      logger.verbose(`Writing to ${mergedOptions.output}...`);
      fs.writeFileSync(mergedOptions.output, JSON.stringify(result.schema, null, 2));

      logger.info(`Original operations: ${result.originalOperationCount}`);
      logger.info(`Reduced operations: ${result.reducedOperationCount}`);
      logger.info(
        `Final size: ${logger.formatBytes(result.sizeBytes)} (${result.sizeBytes.toLocaleString()} bytes)`
      );

      if (result.sizeBytes > parseInt(mergedOptions.size)) {
        logger.warn('Schema exceeds size limit!');
      } else {
        logger.success('Schema is within size limit');
      }

      logger.success(`Reduced schema saved to: ${mergedOptions.output}`);

      // Print operations summary
      logger.header('OPERATIONS INCLUDED IN REDUCED SCHEMA');

      for (const op of result.operations) {
        logger.log(logger.formatOperation(op.method, op.path, op.summary));
      }

      logger.separator();
    } catch (error) {
      logger.failSpinner();
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('reduce')
  .description('Reduce a local OpenAPI schema file')
  .requiredOption('-i, --input <file>', 'Input schema file')
  .option('-o, --output <file>', 'Output file path', 'reduced_schema.json')
  .option('-a, --actions <number>', 'Maximum number of actions', '30')
  .option('-s, --size <bytes>', 'Maximum size in bytes', String(1024 * 1024))
  .option('-m, --methods <methods>', 'Filter by HTTP methods (comma-separated, e.g., "get,post")')
  .option('--include-examples', 'Include examples in schema', false)
  .action(async (options) => {
    try {
      // Load and merge config
      const globalOpts = program.opts();
      const config = loadConfig(globalOpts.config);
      const mergedOptions = mergeConfig(options, config);

      logger.verbose('Starting reduce command...');
      logger.startSpinner(`Reading schema from ${mergedOptions.input}...`);

      if (!fs.existsSync(mergedOptions.input)) {
        logger.failSpinner();
        throw new Error(`Input file not found: ${mergedOptions.input}`);
      }

      const schemaContent = fs.readFileSync(mergedOptions.input, 'utf8');
      const schema: OpenAPISchema = JSON.parse(schemaContent);
      logger.succeedSpinner('Schema loaded successfully');

      const originalSize = Buffer.byteLength(schemaContent, 'utf8');
      logger.info(`Original schema size: ${logger.formatBytes(originalSize)}`);

      // Validate original schema
      logger.verbose('Validating original schema...');
      try {
        validateSchemaOrThrow(schema, 'Original schema');
        logger.verbose('Original schema is valid');
      } catch (error) {
        logger.warn('Original schema validation failed, continuing anyway...');
        logger.verbose(error instanceof Error ? error.message : String(error));
      }

      logger.startSpinner(`Reducing schema to ${mergedOptions.actions} operations...`);
      
      const methodFilter = parseMethodFilter(mergedOptions.methods);
      if (methodFilter) {
        logger.verbose(`Filtering to methods: ${methodFilter.join(', ')}`);
      }
      
      const reducer = new OpenAPIReducer({
        maxActions: parseInt(mergedOptions.actions),
        maxSizeBytes: parseInt(mergedOptions.size),
        includeExamples: mergedOptions.includeExamples,
        coreEntities: mergedOptions.coreEntities,
        maxDescriptionLength: mergedOptions.maxDescriptionLength,
        methodFilter,
      });

      const result = reducer.reduce(schema);
      logger.succeedSpinner('Schema reduced successfully');

      // Validate reduced schema
      logger.verbose('Validating reduced schema...');
      try {
        validateSchemaOrThrow(result.schema, 'Reduced schema');
        logger.success('Reduced schema is valid');
      } catch (error) {
        logger.error('Reduced schema validation failed!');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }

      // Save to file
      const outputPath = path.resolve(mergedOptions.output);
      logger.verbose(`Writing to ${outputPath}...`);
      fs.writeFileSync(outputPath, JSON.stringify(result.schema, null, 2));

      logger.info(`Original operations: ${result.originalOperationCount}`);
      logger.info(`Reduced operations: ${result.reducedOperationCount}`);
      logger.info(
        `Final size: ${logger.formatBytes(result.sizeBytes)} (${result.sizeBytes.toLocaleString()} bytes)`
      );

      if (result.sizeBytes > parseInt(mergedOptions.size)) {
        logger.warn('Schema exceeds size limit!');
      } else {
        logger.success('Schema is within size limit');
      }

      logger.success(`Reduced schema saved to: ${outputPath}`);

      // Print operations summary
      logger.header('OPERATIONS INCLUDED IN REDUCED SCHEMA');

      for (const op of result.operations) {
        logger.log(logger.formatOperation(op.method, op.path, op.summary));
      }

      logger.separator();
    } catch (error) {
      logger.failSpinner();
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('wizard')
  .description('Interactive wizard to select which operations to keep')
  .requiredOption('-i, --input <file>', 'Input schema file')
  .option('-u, --url <url>', 'URL to fetch OpenAPI schema from (alternative to --input)')
  .option('-H, --header <header...>', 'HTTP headers for URL fetch (format: "Key: Value")')
  .option('-o, --output <file>', 'Output file path', 'reduced_schema.json')
  .option('--include-examples', 'Include examples in schema', false)
  .action(async (options) => {
    try {
      // Load and merge config
      const globalOpts = program.opts();
      const config = loadConfig(globalOpts.config);
      const mergedOptions = mergeConfig(options, config);

      let schema: OpenAPISchema;

      if (mergedOptions.url) {
        logger.startSpinner(`Fetching schema from ${mergedOptions.url}...`);

        const headers: Record<string, string> = {};
        if (mergedOptions.header) {
          for (const h of mergedOptions.header) {
            const colonIndex = h.indexOf(':');
            if (colonIndex > 0) {
              const key = h.substring(0, colonIndex).trim();
              const value = h.substring(colonIndex + 1).trim();
              headers[key] = value;
              logger.verbose(`Added header: ${key}`);
            }
          }
        }

        schema = await SchemaFetcher.fetch({ url: mergedOptions.url, headers });
        logger.succeedSpinner('Schema fetched successfully');
      } else if (mergedOptions.input) {
        logger.startSpinner(`Reading schema from ${mergedOptions.input}...`);

        if (!fs.existsSync(mergedOptions.input)) {
          logger.failSpinner();
          throw new Error(`Input file not found: ${mergedOptions.input}`);
        }

        const schemaContent = fs.readFileSync(mergedOptions.input, 'utf8');
        schema = JSON.parse(schemaContent);
        logger.succeedSpinner('Schema loaded successfully');
      } else {
        throw new Error('Either --input or --url is required');
      }

      const originalSize = Buffer.byteLength(JSON.stringify(schema), 'utf8');
      logger.info(`Schema size: ${logger.formatBytes(originalSize)}`);

      // Validate original schema
      logger.verbose('Validating original schema...');
      try {
        validateSchemaOrThrow(schema, 'Original schema');
        logger.verbose('Original schema is valid');
      } catch (error) {
        logger.warn('Original schema validation failed, continuing anyway...');
        logger.verbose(error instanceof Error ? error.message : String(error));
      }

      // Run the interactive wizard
      const result = await runWizard(schema, {
        includeExamples: mergedOptions.includeExamples,
        coreEntities: mergedOptions.coreEntities,
        maxDescriptionLength: mergedOptions.maxDescriptionLength,
      });

      // Validate reduced schema
      logger.verbose('Validating reduced schema...');
      try {
        validateSchemaOrThrow(result.schema, 'Reduced schema');
        logger.success('Reduced schema is valid');
      } catch (error) {
        logger.error('Reduced schema validation failed!');
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }

      // Save to file
      const outputPath = path.resolve(mergedOptions.output);
      logger.verbose(`Writing to ${outputPath}...`);
      fs.writeFileSync(outputPath, JSON.stringify(result.schema, null, 2));

      logger.success(`Reduced schema saved to: ${outputPath}`);

      // Print operations summary
      logger.header('OPERATIONS INCLUDED IN REDUCED SCHEMA');

      for (const op of result.operations) {
        logger.log(logger.formatOperation(op.method, op.path, op.summary));
      }

      logger.separator();
    } catch (error) {
      logger.failSpinner();
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();
