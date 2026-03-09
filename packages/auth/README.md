# MaximCoach Auth Package

Authentication and authorization logic for the MaximCoach application.

## Features

- Supabase authentication integration
- JWT token handling
- User session management
- Role-based access control

## Getting Started

### Installation

```bash
# Install as a dependency in other packages
pnpm add @maxima/auth
```

### Usage

```typescript
import { authenticateUser } from '@maxima/auth';
```

## Project Structure

- `src/` - Main authentication logic
  - `auth.ts` - Authentication utilities
  - `jwt.ts` - JWT token handling
  - `supabase.ts` - Supabase client configuration

## Contributing

When adding new authentication features, ensure they:
1. Follow security best practices
2. Handle edge cases properly
3. Are thoroughly tested
4. Maintain backward compatibility

## License

This package is part of the MaximCoach project and licensed under the MIT license.