import { reduceFromURL, OpenAPIReducer, SchemaFetcher } from 'spec-shaver';
import * as fs from 'fs';

// Example 1: Quick reduction from a URL
async function example1() {
  console.log('Example 1: Quick reduction from a URL\n');

  const result = await reduceFromURL('https://api.example.com/openapi.json', {
    maxActions: 30,
    maxSizeBytes: 1024 * 1024, // 1MB
  });

  console.log(`Reduced to ${result.reducedOperationCount} operations`);
  console.log(`Size: ${(result.sizeBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log('\nFirst 5 operations:');
  result.operations.slice(0, 5).forEach((op) => {
    console.log(`  ${op.method.padEnd(6)} ${op.path}`);
  });
}

// Example 2: Using the reducer class with custom entities
async function example2() {
  console.log('\n\nExample 2: Custom entities and options\n');

  const schema = await SchemaFetcher.fetch({
    url: 'https://api.example.com/openapi.json',
    headers: { Authorization: 'Bearer YOUR_TOKEN' },
  });

  const reducer = new OpenAPIReducer({
    maxActions: 20,
    maxSizeBytes: 500 * 1024, // 500KB
    coreEntities: ['users', 'products', 'orders'],
    includeExamples: false,
    maxDescriptionLength: 150,
  });

  const result = reducer.reduce(schema);

  console.log(`Original: ${result.originalOperationCount} operations`);
  console.log(`Reduced: ${result.reducedOperationCount} operations`);
  console.log(`Size: ${(result.sizeBytes / 1024).toFixed(2)} KB`);

  // Save to file
  fs.writeFileSync('reduced-schema.json', JSON.stringify(result.schema, null, 2));
  console.log('\nSaved to: reduced-schema.json');
}

// Example 3: Reduce a local file
async function example3() {
  console.log('\n\nExample 3: Reduce a local schema file\n');

  // Load local schema
  const schemaContent = fs.readFileSync('local-schema.json', 'utf8');
  const schema = JSON.parse(schemaContent);

  // Create reducer
  const reducer = new OpenAPIReducer({
    maxActions: 25,
  });

  // Reduce schema
  const result = reducer.reduce(schema);

  console.log('Result:');
  console.log(`  Operations: ${result.originalOperationCount} → ${result.reducedOperationCount}`);
  console.log(`  Size: ${(result.sizeBytes / 1024 / 1024).toFixed(2)} MB`);

  // Save result
  fs.writeFileSync('output.json', JSON.stringify(result.schema, null, 2));
}

// Example 4: Fetch with custom headers (for authenticated APIs)
async function example4() {
  console.log('\n\nExample 4: Fetch with authentication headers\n');

  const schema = await SchemaFetcher.fetch({
    url: 'https://api.example.com/openapi.json',
    headers: {
      Authorization: 'Bearer YOUR_API_TOKEN',
      'X-API-Key': 'your-api-key',
    },
    timeout: 30000,
  });

  const reducer = new OpenAPIReducer({
    maxActions: 40,
    coreEntities: ['users', 'products', 'orders'],
  });

  const result = reducer.reduce(schema);

  console.log(`Reduced to ${result.reducedOperationCount} operations`);
}

// Run examples (comment out the ones you don't want to run)
async function main() {
  try {
    // await example1();
    // await example2();
    // await example3();
    // await example4();

    console.log('\nNote: Uncomment the examples you want to run in usage.ts');
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
