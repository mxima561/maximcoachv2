# MaximCoach Web Application

The main web frontend for the MaximCoach application, built with Next.js.

## Features

- Modern React UI with Tailwind CSS
- AI-powered coaching features
- Voice interaction capabilities
- Supabase authentication integration

## Getting Started

### Prerequisites

- Node.js 18+
- PNPM

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

- `src/app` - Next.js app directory
- `src/components` - Reusable React components
- `src/lib` - Utility functions and services
- `src/hooks` - Custom React hooks

## Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

## Deployment

The application is designed to be deployed on Vercel or similar Next.js hosting platforms.