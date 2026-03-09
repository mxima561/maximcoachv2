# MaximCoach v2

A full-stack application for AI-powered coaching and voice interaction.

## Project Structure

This monorepo contains multiple applications and shared packages:

### Apps
- `apps/web` - The main web frontend built with Next.js
- `apps/api` - The backend API server using Fastify
- `apps/voice` - Voice processing and interaction services
- `apps/coach` - Core coaching functionality
- `apps/extension` - Browser extension (if applicable)

### Packages
- `packages/shared` - Shared utilities and types
- `packages/auth` - Authentication logic with Supabase

## Getting Started

### Prerequisites
- Node.js 18+
- PNPM 7+
- Docker (for local development)

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment files
cp .env.example .env
```

### Development

```bash
# Start all services
pnpm dev

# Or start specific services
pnpm --filter @maxima/web dev
pnpm --filter @maxima/api dev
```

## Environment Variables

See `docs/env-contract.json` for the complete list of required environment variables.

## Deployment

### Local Development
```bash
# Start services with Docker
docker-compose up
```

## Contributing

Please read `CONTRIBUTING.md` for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details.