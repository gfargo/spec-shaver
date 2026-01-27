#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { OpenAPIReducer } from './reducer';
import { SchemaFetcher } from './fetcher';
import { OpenAPISchema } from './types';
import { runWizard } from './wizard';

const program = new Command();

program
  .name('spec-shaver')
  .description('Intelligently reduce OpenAPI schemas to a specified number of operations and size')
  .version('1.0.0');

program
  .command('fetch')
  .description('Fetch and reduce an OpenAPI schema from a URL')
  .requiredOption('-u, --url <url>', 'URL to fetch OpenAPI schema from')
  .option('-H, --header <header...>', 'HTTP headers (format: "Key: Value")')
  .option('-o, --output <file>', 'Output file path', 'reduced_schema.json')
  .option('-a, --actions <number>', 'Maximum number of actions', '30')
  .option('-s, --size <bytes>', 'Maximum size in bytes', String(1024 * 1024))
  .option('--include-examples', 'Include examples in schema', false)
  .action(async (options) => {
    try {
      console.log(`Fetching schema from ${options.url}...`);

      // Parse headers from command line
      const headers: Record<string, string> = {};
      if (options.header) {
        for (const h of options.header) {
          const colonIndex = h.indexOf(':');
          if (colonIndex > 0) {
            const key = h.substring(0, colonIndex).trim();
            const value = h.substring(colonIndex + 1).trim();
            headers[key] = value;
          }
        }
      }

      const schema = await SchemaFetcher.fetch({ url: options.url, headers });

      const originalSize = Buffer.byteLength(JSON.stringify(schema), 'utf8');
      console.log(`Fetched schema: ${(originalSize / (1024 * 1024)).toFixed(2)} MB`);

      console.log(`\nReducing schema to ${options.actions} actions...`);
      const reducer = new OpenAPIReducer({
        maxActions: parseInt(options.actions),
        maxSizeBytes: parseInt(options.size),
        includeExamples: options.includeExamples,
      });

      const result = reducer.reduce(schema);

      // Save to file
      fs.writeFileSync(options.output, JSON.stringify(result.schema, null, 2));

      console.log(`Original operation count: ${result.originalOperationCount}`);
      console.log(`Reduced operation count: ${result.reducedOperationCount}`);
      console.log(
        `\nFinal schema size: ${(result.sizeBytes / (1024 * 1024)).toFixed(2)} MB (${result.sizeBytes.toLocaleString()} bytes)`
      );

      if (result.sizeBytes > parseInt(options.size)) {
        console.log('⚠️  Warning: Schema exceeds size limit!');
      } else {
        console.log('✓ Schema is within size limit!');
      }

      console.log(`\n✓ Reduced schema saved to: ${options.output}`);

      // Print operations summary
      console.log('\n' + '='.repeat(80));
      console.log('OPERATIONS INCLUDED IN REDUCED SCHEMA');
      console.log('='.repeat(80));

      for (const op of result.operations) {
        const methodPadded = op.method.padEnd(7);
        const pathPadded = op.path.padEnd(45);
        console.log(`${methodPadded} ${pathPadded} ${op.summary || ''}`);
      }

      console.log('='.repeat(80));
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
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
  .option('--include-examples', 'Include examples in schema', false)
  .action(async (options) => {
    try {
      console.log(`Reading schema from ${options.input}...`);
      
      if (!fs.existsSync(options.input)) {
        throw new Error(`Input file not found: ${options.input}`);
      }
      
      const schemaContent = fs.readFileSync(options.input, 'utf8');
      const schema: OpenAPISchema = JSON.parse(schemaContent);
      
      const originalSize = Buffer.byteLength(schemaContent, 'utf8');
      console.log(`Original schema size: ${(originalSize / (1024 * 1024)).toFixed(2)} MB`);
      
      console.log(`\nReducing schema to ${options.actions} actions...`);
      const reducer = new OpenAPIReducer({
        maxActions: parseInt(options.actions),
        maxSizeBytes: parseInt(options.size),
        includeExamples: options.includeExamples,
      });
      
      const result = reducer.reduce(schema);
      
      // Save to file
      const outputPath = path.resolve(options.output);
      fs.writeFileSync(outputPath, JSON.stringify(result.schema, null, 2));
      
      console.log(`Original operation count: ${result.originalOperationCount}`);
      console.log(`Reduced operation count: ${result.reducedOperationCount}`);
      console.log(`\nFinal schema size: ${(result.sizeBytes / (1024 * 1024)).toFixed(2)} MB (${result.sizeBytes.toLocaleString()} bytes)`);
      
      if (result.sizeBytes > parseInt(options.size)) {
        console.log('⚠️  Warning: Schema exceeds size limit!');
      } else {
        console.log('✓ Schema is within size limit!');
      }
      
      console.log(`\n✓ Reduced schema saved to: ${outputPath}`);
      
      // Print operations summary
      console.log('\n' + '='.repeat(80));
      console.log('OPERATIONS INCLUDED IN REDUCED SCHEMA');
      console.log('='.repeat(80));
      
      for (const op of result.operations) {
        const methodPadded = op.method.padEnd(7);
        const pathPadded = op.path.padEnd(45);
        console.log(`${methodPadded} ${pathPadded} ${op.summary || ''}`);
      }
      
      console.log('='.repeat(80));
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
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
      let schema: OpenAPISchema;

      if (options.url) {
        console.log(`Fetching schema from ${options.url}...`);

        const headers: Record<string, string> = {};
        if (options.header) {
          for (const h of options.header) {
            const colonIndex = h.indexOf(':');
            if (colonIndex > 0) {
              const key = h.substring(0, colonIndex).trim();
              const value = h.substring(colonIndex + 1).trim();
              headers[key] = value;
            }
          }
        }

        schema = await SchemaFetcher.fetch({ url: options.url, headers });
      } else if (options.input) {
        console.log(`Reading schema from ${options.input}...`);

        if (!fs.existsSync(options.input)) {
          throw new Error(`Input file not found: ${options.input}`);
        }

        const schemaContent = fs.readFileSync(options.input, 'utf8');
        schema = JSON.parse(schemaContent);
      } else {
        throw new Error('Either --input or --url is required');
      }

      const originalSize = Buffer.byteLength(JSON.stringify(schema), 'utf8');
      console.log(`Schema size: ${(originalSize / (1024 * 1024)).toFixed(2)} MB`);

      // Run the interactive wizard
      const result = await runWizard(schema, {
        includeExamples: options.includeExamples,
      });

      // Save to file
      const outputPath = path.resolve(options.output);
      fs.writeFileSync(outputPath, JSON.stringify(result.schema, null, 2));

      console.log(`\n✓ Reduced schema saved to: ${outputPath}`);

      // Print operations summary
      console.log('\n' + '='.repeat(80));
      console.log('OPERATIONS INCLUDED IN REDUCED SCHEMA');
      console.log('='.repeat(80));

      for (const op of result.operations) {
        const methodPadded = op.method.padEnd(7);
        const pathPadded = op.path.padEnd(45);
        console.log(`${methodPadded} ${pathPadded} ${op.summary || ''}`);
      }

      console.log('='.repeat(80));
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
