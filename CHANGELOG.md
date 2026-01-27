# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-01-26

### Added

- **Color-coded output** - Enhanced CLI with colored HTTP methods and formatted output
- **Config file support** - `.spec-shaver.json` for project-specific defaults
- **Verbose mode** - `-v, --verbose` flag for detailed operation logging
- **Quiet mode** - `-q, --quiet` flag to suppress all output except errors
- **Schema validation** - Automatic validation of input and output OpenAPI schemas
- **Progress indicators** - Spinners and real-time feedback during operations
- **Undo in wizard** - Navigate back through wizard steps with "Go back" option
- **Init command** - `spec-shaver init` to create default config file
- **Logger module** - Centralized logging with color support and formatting
- **Validator module** - OpenAPI schema validation utilities
- **Config module** - Configuration file loading and merging

### Changed

- All CLI commands now use color-coded output for better readability
- Wizard now supports navigation between steps
- Error messages are more descriptive and helpful
- File operations show progress with spinners
- CLI options can be overridden by config file settings

### Improved

- Better error handling with context-aware messages
- More informative operation summaries
- Enhanced user experience in wizard mode
- Clearer validation error messages

### Dependencies

- Added `chalk` for color output
- Added `ora` for progress spinners
- Added `openapi-schema-validator` for schema validation

## [1.0.0] - 2026-01-26

### Initial Release

- OpenAPI schema reducer with smart prioritization
- CLI tool with fetch and reduce commands
- Interactive wizard for manual operation selection
- Programmatic API for TypeScript/JavaScript
- Support for any OpenAPI 3.x schema
- URL fetching with custom headers for authenticated APIs
- Size optimization features
- Schema reference resolution
- Configurable core entities
- Example removal and description truncation

### Features

- Fetch and reduce schemas from URLs
- Reduce local schema files
- Interactive wizard with three selection modes
- Customize maximum operations and size limits
- Prioritize specific entities
- Include/exclude examples
- TypeScript type definitions
- Command-line interface

## [Unreleased]

### Planned

- Schema merging - Combine multiple OpenAPI schemas
- Operation search/filter in wizard
- Better wizard pagination with operation counts
- Save/load wizard selections
- Dry-run mode for previewing reductions
- YAML output format support
- Custom scoring functions
- Batch processing support
- Add unit tests
- Add integration tests
