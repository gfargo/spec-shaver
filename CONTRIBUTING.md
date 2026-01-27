# Contributing to Spec Shaver

Thank you for your interest in contributing! Here's how you can help.

## Development Setup

1. Fork and clone the repository:
```bash
git clone https://github.com/gfargo/spec-shaver.git
cd spec-shaver
```

2. Install dependencies:
```bash
pnpm install
```

3. Build the project:
```bash
pnpm build
```

## Project Structure

```
spec-shaver/
├── src/                    # TypeScript source code
│   ├── types.ts           # Type definitions
│   ├── reducer.ts         # Main reducer logic
│   ├── fetcher.ts         # Schema fetching utilities
│   ├── cli.ts             # Command-line interface
│   └── index.ts           # Main exports
├── examples/              # Usage examples
│   └── usage.ts          # Example code
├── docs/                  # Documentation
│   ├── GETTING_STARTED.md
│   ├── CONTRIBUTING.md   # This file
│   ├── PUBLISHING.md
│   ├── STRUCTURE.md
│   ├── PROJECT_SUMMARY.md
│   └── CHANGELOG.md
├── .kiro/                 # Kiro configuration
│   └── steering/         # AI assistant guidance
├── dist/                  # Compiled JavaScript (generated)
├── README.md             # Main documentation
├── package.json
└── tsconfig.json
```

For detailed structure information, see `docs/STRUCTURE.md`.

## Making Changes

1. Create a new branch:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes in the `src/` directory

3. Build and test:
```bash
pnpm build
pnpm test
```

4. Lint your code:
```bash
pnpm lint
```

5. Format your code:
```bash
pnpm format
```

## Testing

Add tests for any new functionality. Tests should be placed in `__tests__/` directory with `.test.ts` extension.

## Commit Guidelines

- Use clear, descriptive commit messages
- Reference issue numbers when applicable
- Keep commits focused on a single change

Example commit messages:
- `feat: Add option to customize description truncation`
- `fix: Handle schemas without components section`
- `docs: Update README with new examples`

## Pull Request Process

1. Update the README.md with details of changes if needed
2. Update the examples if you've added new functionality
3. Ensure all tests pass and code is properly formatted
4. Create a Pull Request with a clear title and description

## Code Style

- Follow the existing code style
- Use TypeScript's strict mode
- Add JSDoc comments for public APIs
- Use meaningful variable and function names
- See `.kiro/steering/conventions.md` for detailed guidelines

## Questions?

Feel free to open an issue for:
- Bug reports
- Feature requests
- Questions about usage or contribution

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
