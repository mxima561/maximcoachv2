# MaximCoach Shared Package

Shared utilities, types, and components used across the MaximCoach monorepo.

## Features

- Common TypeScript types and interfaces
- Shared utility functions
- Zod schemas for data validation
- Constants and configuration values

## Getting Started

### Installation

```bash
# Install as a dependency in other packages
pnpm add @maxima/shared
```

### Usage

```typescript
import { someUtilityFunction } from '@maxima/shared';
```

## Project Structure

- `src/` - Main shared code
  - `constants.ts` - Shared constants
  - `schemas.ts` - Zod schemas for data validation
  - `index.ts` - Main export file

## Contributing

When adding new shared utilities, ensure they are:
1. Pure functions (no side effects)
2. Well-typed with TypeScript
3. Documented with JSDoc comments

## License

This package is part of the MaximCoach project and licensed under the MIT license.