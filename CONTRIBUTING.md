# Contributing to MaximCoach

Thank you for your interest in contributing to MaximCoach! This guide will help you get started with development and understand our contribution process.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Process](#development-process)
4. [Testing](#testing)
5. [Documentation](#documentation)
6. [Pull Request Process](#pull-request-process)

## Code of Conduct

This project adheres to a Code of Conduct that we expect all contributors to follow. Please read the [full code of conduct](CODE_OF_CONDUCT.md) before participating.

## Getting Started

### Prerequisites

- Node.js 18+
- PNPM 7+
- Docker (for local development)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/maximcoachv2.git
cd maximcoachv2

# Install dependencies
pnpm install

# Copy environment files
cp .env.example .env
```

### Development Setup

```bash
# Start all services in development mode
pnpm dev

# Or start specific services
pnpm --filter @maxima/web dev
pnpm --filter @maxima/api dev
```

## Development Process

### Branching Strategy

We follow a branching strategy:

- `main` - Production-ready code
- `develop` - Integration branch for features
- Feature branches - `feature/feature-name`

### Commit Messages

Follow the conventional commit format:

```
<type>(<scope>): <subject>
```

Types:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Formatting changes
- `refactor` - Code restructuring
- `test` - Adding or modifying tests

## Testing

All contributions must include appropriate tests:

### Unit Tests
- Write unit tests for new functionality
- Ensure 80%+ code coverage
- Tests should be isolated and fast

### Integration Tests
- Test API endpoints
- Test database interactions
- Test external service integrations

### End-to-End Tests
- Test user flows in the web application
- Test voice interaction capabilities

Run tests with:
```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage
```

## Documentation

### Code Documentation

All public APIs must be documented with JSDoc comments:

```typescript
/**
 * Authenticates a user with the provided credentials
 * @param credentials - User login credentials
 * @returns Promise resolving to authentication token
 */
async function authenticateUser(credentials: Credentials): Promise<string> {
  // implementation
}
```

### Project Documentation

Update relevant documentation files:
- README.md - Main project overview
- APP_NAME/README.md - Per-app documentation
- docs/ - Additional documentation files

## Pull Request Process

1. Fork the repository and create your feature branch
2. Make your changes following the code style
3. Write tests for new functionality
4. Update documentation as needed
5. Ensure all tests pass
6. Submit a pull request to the `develop` branch

### Review Process

- All PRs require at least one review
- CI checks must pass
- Code coverage should not decrease
- Documentation should be updated if needed

## Reporting Issues

Please report issues using the GitHub issue tracker. Include:
- Steps to reproduce
- Expected and actual behavior
- Environment details (OS, Node version, etc.)