# Spec Shaver

A TypeScript/Node.js package to intelligently reduce OpenAPI schemas to a specified number of operations and size limit.

## Features

- ✨ **Smart Prioritization**: Intelligently selects the most important operations based on entity importance and operation type
- 🧙 **Interactive Wizard**: Manually select operations by groups/tags or individually
- 📦 **Size Optimization**: Automatically reduces schema size by removing examples and truncating descriptions
- 🔧 **Flexible Configuration**: Customize which entities to prioritize and how many operations to include
- 🎯 **Schema Validity**: Automatically includes all referenced schemas to maintain valid OpenAPI specification
- 🚀 **CLI Tool**: Easy-to-use command-line interface
- 📚 **Programmatic API**: Use as a library in your own code

## Command Comparison

| Command | Selection | Best For |
|---------|-----------|----------|
| `reduce` | Automatic | Quick reduction with algorithmic prioritization |
| `wizard` | Interactive | Manual control - select by groups or individual endpoints |
| `fetch` | Automatic | Fetching and reducing remote schemas via URL |

## Installation

```bash
npm install spec-shaver
# or
pnpm add spec-shaver
# or
yarn add spec-shaver
```

## Quick Start

### Running Locally (Development)

```bash
# Install dependencies
pnpm install

# Build and run
pnpm dev reduce --input schema.json --output reduced.json

# Or build first, then run
pnpm build
pnpm start reduce --input schema.json --output reduced.json

# Or run directly with node
node dist/cli.js reduce --input schema.json
```

### As a CLI Tool (After Install)

```bash
npx spec-shaver reduce --input schema.json --output reduced.json
```

Fetch and reduce from a URL:

```bash
npx spec-shaver fetch --url https://api.example.com/openapi.json
```

**Interactive wizard** - select exactly which endpoints to keep:

```bash
npx spec-shaver wizard --input schema.json --output reduced.json
```

### As a Library

```typescript
import { OpenAPIReducer, SchemaFetcher } from 'spec-shaver';
import * as fs from 'fs';

// Load your OpenAPI schema
const schemaContent = fs.readFileSync('openapi.json', 'utf8');
const schema = JSON.parse(schemaContent);

// Create reducer with options
const reducer = new OpenAPIReducer({
  maxActions: 30,
  maxSizeBytes: 1024 * 1024, // 1MB
  coreEntities: ['users', 'orders', 'products'],
  includeExamples: false,
});

const result = reducer.reduce(schema);

console.log(`Reduced to ${result.reducedOperationCount} operations`);
console.log(`Size: ${(result.sizeBytes / 1024 / 1024).toFixed(2)} MB`);

// Or fetch from a URL
const remoteSchema = await SchemaFetcher.fetch({ url: 'https://api.example.com/openapi.json' });
const remoteResult = reducer.reduce(remoteSchema);
```

## CLI Usage

### Reduce Local File

```bash
spec-shaver reduce [options]

Options:
  -i, --input <file>        Input schema file (required)
  -o, --output <file>       Output file path (default: "reduced_schema.json")
  -a, --actions <number>    Maximum number of actions (default: 30)
  -s, --size <bytes>        Maximum size in bytes (default: 1048576)
  --include-examples        Include examples in schema (default: false)
  -h, --help                Display help
```

Example:

```bash
spec-shaver reduce \
  --input original-schema.json \
  --output reduced-schema.json \
  --actions 20
```

### Fetch from URL

```bash
spec-shaver fetch [options]

Options:
  -u, --url <url>           URL to fetch OpenAPI schema from (required)
  -H, --header <header...>  HTTP headers (format: "Key: Value")
  -o, --output <file>       Output file path (default: "reduced_schema.json")
  -a, --actions <number>    Maximum number of actions (default: 30)
  -s, --size <bytes>        Maximum size in bytes (default: 1048576)
  --include-examples        Include examples in schema (default: false)
  -h, --help                Display help
```

Example:

```bash
spec-shaver fetch \
  --url https://api.example.com/openapi.json \
  --header "Authorization: Bearer YOUR_TOKEN" \
  --output my-schema.json \
  --actions 25
```

### Interactive Wizard

The wizard lets you interactively select which operations to include:

```bash
spec-shaver wizard [options]

Options:
  -i, --input <file>        Input schema file
  -u, --url <url>           URL to fetch OpenAPI schema from
  -H, --header <header...>  HTTP headers for URL fetch
  -o, --output <file>       Output file path (default: "reduced_schema.json")
  --include-examples        Include examples in schema (default: false)
  -h, --help                Display help
```

The wizard offers three selection modes:

1. **Select by groups/tags** - Choose entire groups of related endpoints
2. **Select individual operations** - Pick specific endpoints one by one
3. **Keep all operations** - Include everything (only optimize size)

Example:

```bash
spec-shaver wizard --input openapi.json --output reduced.json
```

## Programmatic API

### `reduceFromURL(url, options?)`

Fetch and reduce any OpenAPI schema from a URL.

```typescript
import { reduceFromURL } from 'spec-shaver';

const result = await reduceFromURL('https://api.example.com/openapi.json', {
  maxActions: 50,
  headers: { Authorization: 'Bearer YOUR_TOKEN' },
});
```

### `OpenAPIReducer` Class

For more control, use the reducer class directly:

```typescript
import { OpenAPIReducer } from 'spec-shaver';
import * as fs from 'fs';

// Load schema from file
const schemaContent = fs.readFileSync('openapi.json', 'utf8');
const schema = JSON.parse(schemaContent);

// Create reducer with options
const reducer = new OpenAPIReducer({
  maxActions: 30,
  maxSizeBytes: 1024 * 1024,
  coreEntities: ['users', 'orders', 'products'],
  includeExamples: false,
  maxDescriptionLength: 200,
});

// Reduce the schema
const result = reducer.reduce(schema);

// Save to file
fs.writeFileSync('reduced.json', JSON.stringify(result.schema, null, 2));

// Access result information
console.log('Operations:', result.operations);
console.log('Original count:', result.originalOperationCount);
console.log('Reduced count:', result.reducedOperationCount);
console.log('Size:', result.sizeBytes);
```

## Configuration Options

### `ReducerOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxActions` | `number` | `30` | Maximum number of operations to include |
| `maxSizeBytes` | `number` | `1048576` (1MB) | Maximum schema size in bytes |
| `coreEntities` | `string[]` | See below | Entities to prioritize |
| `includeExamples` | `boolean` | `false` | Whether to include example fields |
| `maxDescriptionLength` | `number` | `200` | Maximum length for descriptions |

### Default Core Entities

```typescript
[
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
]
```

## How It Works

### 1. Operation Prioritization

Operations are scored based on:

- **Entity Importance** (100 points): Paths containing core entities
- **HTTP Method** (20-50 points):
  - GET: 50 points
  - POST: 40 points
  - PATCH/PUT: 30 points
  - DELETE: 20 points
- **Endpoint Type** (10-15 points):
  - Collection endpoints (e.g., `/users`): 15 points
  - Single resource endpoints (e.g., `/users/{id}`): 10 points
- **Documentation Quality** (5 points): Operations with clear summaries

### 2. Schema Inclusion

The reducer automatically includes all referenced schemas from the `components/schemas` section by:

1. Scanning all selected operations for `$ref` references
2. Recursively resolving nested schema references
3. Including only the schemas that are actually used

### 3. Size Optimization

If the reduced schema exceeds the size limit, the reducer applies optimizations in order:

1. Remove `example` and `examples` fields from component schemas
2. Remove examples from path operations
3. Truncate descriptions longer than `maxDescriptionLength`

## Output Format

### `ReducerResult`

```typescript
interface ReducerResult {
  schema: OpenAPISchema;              // The reduced OpenAPI schema
  originalOperationCount: number;     // Number of operations in original schema
  reducedOperationCount: number;      // Number of operations in reduced schema
  sizeBytes: number;                  // Size of reduced schema in bytes
  operations: Array<{                 // List of included operations
    method: string;
    path: string;
    summary?: string;
  }>;
}
```

## Examples

### Customize Core Entities

```typescript
const reducer = new OpenAPIReducer({
  maxActions: 20,
  coreEntities: ['workspaces', 'members', 'projects'],
});
```

### Include Examples and Increase Size Limit

```typescript
const reducer = new OpenAPIReducer({
  maxActions: 50,
  maxSizeBytes: 2 * 1024 * 1024, // 2MB
  includeExamples: true,
});
```

### Reduce from Local File

```typescript
import { OpenAPIReducer } from 'spec-shaver';
import * as fs from 'fs';

const schemaContent = fs.readFileSync('schema.json', 'utf8');
const schema = JSON.parse(schemaContent);

const reducer = new OpenAPIReducer({ maxActions: 25 });
const result = reducer.reduce(schema);

fs.writeFileSync('output.json', JSON.stringify(result.schema, null, 2));
```

## Development

### Setup

```bash
git clone https://github.com/gfargo/spec-shaver.git
cd spec-shaver
pnpm install
```

### Build

```bash
pnpm build
```

### Run Locally

```bash
# Run CLI after building
pnpm start reduce --input schema.json

# Build and run in one command
pnpm dev reduce --input schema.json
```

### Testing

```bash
pnpm test
```

### Linting

```bash
pnpm lint
```

## Documentation

- **[Getting Started](docs/GETTING_STARTED.md)** - Quick start guide
- **[Contributing](docs/CONTRIBUTING.md)** - Contribution guidelines
- **[Publishing](docs/PUBLISHING.md)** - How to publish to NPM
- **[Structure](docs/STRUCTURE.md)** - Package structure details
- **[Project Summary](docs/PROJECT_SUMMARY.md)** - High-level overview
- **[Changelog](docs/CHANGELOG.md)** - Version history

## License

MIT

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

## Issues

Found a bug or have a feature request? Please [open an issue](https://github.com/gfargo/spec-shaver/issues).
