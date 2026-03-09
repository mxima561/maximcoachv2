# MaximCoach Voice Service

The voice processing and interaction service for the MaximCoach application.

## Features

- Real-time voice processing with Deepgram
- Text-to-speech with ElevenLabs
- WebSocket-based communication
- AI-powered voice interaction

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

- `src/` - Main service implementation
- `src/websocket` - WebSocket connection handlers
- `src/voice-processing` - Voice processing logic
- `src/speech` - Text-to-speech services

## Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

## Deployment

The voice service can be deployed using Docker or directly on Node.js environments.