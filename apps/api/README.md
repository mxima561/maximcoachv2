# MaximCoach API Server

The backend API server for the MaximCoach application, built with Fastify.

## Features

- RESTful API endpoints
- AI integration with OpenAI
- Supabase database integration
- Stripe payment processing
- Redis caching support

## Getting Started

### Prerequisites

- Node.js 18+
- PNPM
- Docker (for local development)

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
```

### Development

```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Run production server
pnpm start
```

## Environment Variables

See the root `docs/env-contract.json` for required environment variables.

## Project Structure

- `src/routes` - API route handlers
- `src/services` - Business logic and service layer
- `src/lib` - Utility functions and database connections
- `src/middleware` - Request processing middleware

## Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

## Deployment

The API can be deployed using Docker or directly on Node.js environments.