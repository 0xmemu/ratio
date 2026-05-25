# Contributing to Ratio

Thank you for your interest in contributing to Ratio! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Message Guidelines](#commit-message-guidelines)

## Code of Conduct

This project follows professional development standards. Please:

- Be respectful and considerate
- Focus on constructive feedback
- Maintain code quality and documentation standards
- Follow security best practices

## Development Setup

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- PostgreSQL (for local development)
- Redis (for local development)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/0xmemu/ratio.git
cd ratio

# Run setup script
bash scripts/setup.sh
# or
make setup

# Copy environment variables
cp .env.example .env
# Edit .env with your local configuration

# Start infrastructure
make infra-up

# Install dependencies
pnpm install

# Run database migrations
pnpm db:migrate

# Start development
make dev
```

## Project Structure

```
ratio/
├── apps/                    # Application services
│   ├── api/                # REST API server
│   ├── worker/             # Background job processor
│   ├── ops-bot/            # Telegram operations bot
│   ├── simulator/          # Dry-run simulator
│   └── strategy-lab/       # Strategy testing lab
├── packages/               # Shared packages
│   ├── db/                 # Database client & Prisma
│   ├── market-data/        # Market data ingestion
│   ├── scoring-engine/     # Pool scoring logic
│   ├── risk-engine/        # Risk assessment
│   ├── policy-engine/      # Policy enforcement
│   ├── execution-engine/   # Transaction execution
│   ├── strategy-engine/    # Strategy management
│   ├── allocation-engine/  # Capital allocation
│   ├── backtest-core/      # Backtesting framework
│   ├── llm-gateway/        # LLM integration
│   ├── protocol-v3/        # Uniswap v3 SDK
│   └── port-utils/         # Port management utilities
├── docs/                   # Documentation
├── scripts/                # Setup and utility scripts
└── .github/workflows/      # CI/CD workflows
```

## Development Workflow

### Branch Strategy

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/*` - New features
- `fix/*` - Bug fixes
- `chore/*` - Maintenance tasks

### Creating a Feature

```bash
# Create a new branch from develop
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name

# Make your changes
# ...

# Run tests
pnpm test

# Run linting
pnpm lint

# Run type checking
pnpm typecheck

# Build to ensure no errors
pnpm build
```

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm test --coverage

# Run tests for specific package
pnpm --filter @ratio/db test
```

### Writing Tests

- Use Vitest for unit and integration tests
- Place test files next to source files with `.test.ts` extension
- Follow the Arrange-Act-Assert (AAA) pattern
- Mock external dependencies appropriately
- Aim for high code coverage on critical paths

**Example:**

```typescript
import { describe, it, expect } from 'vitest';
import { calculateScore } from './scoring';

describe('scoring engine', () => {
  it('should calculate score correctly', () => {
    // Arrange
    const pool = { liquidity: 1000, volume24h: 5000 };
    
    // Act
    const score = calculateScore(pool);
    
    // Assert
    expect(score).toBeGreaterThan(0);
  });
});
```

## Pull Request Process

1. **Create a PR** from your feature branch to `develop`
2. **Fill out the PR template** with:
   - Description of changes
   - Related issue numbers
   - Testing performed
   - Screenshots (if UI changes)
3. **Ensure CI passes**:
   - Linting
   - Type checking
   - Tests
   - Build
4. **Request review** from maintainers
5. **Address feedback** promptly
6. **Squash and merge** once approved

## Coding Standards

### TypeScript

- Use strict TypeScript settings
- Avoid `any` types - use `unknown` or proper types
- Prefer interfaces over types for objects
- Use `readonly` for immutable data
- Document public APIs with JSDoc comments

### Code Style

- Follow ESLint and Prettier configurations
- Use meaningful variable and function names
- Keep functions small and focused (single responsibility)
- Prefer functional programming patterns where appropriate
- Use async/await over raw promises

### File Organization

- One component/class per file
- Group related functionality in directories
- Use index.ts for public exports
- Keep implementation details private

### Error Handling

- Always handle errors explicitly
- Use custom error types for domain errors
- Log errors with appropriate context
- Never swallow errors silently

## Commit Message Guidelines

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements

### Examples

```bash
feat(market-data): add subgraph data fetching

Implement fetchPoolData() to query Uniswap subgraph for pool metrics
including liquidity, volume, and fee data.

Closes #123
```

```bash
fix(execution-engine): handle gas estimation failures

Add retry logic and fallback gas values when estimation fails.

Fixes #456
```

```bash
test(scoring-engine): add unit tests for composite scoring

Increases coverage to 85% for scoring module.
```

## Security Considerations

- **Never commit secrets** - Use environment variables
- **Validate all inputs** - Especially from external sources
- **Use parameterized queries** - Prevent SQL injection
- **Sanitize user data** - Before logging or displaying
- **Follow principle of least privilege** - Minimize permissions
- **Review dependencies** - Check for known vulnerabilities

## Documentation

- Update README.md for user-facing changes
- Document APIs using JSDoc comments
- Add inline comments for complex logic
- Update docs/ directory for architectural changes
- Include examples in documentation

## Getting Help

- Check existing issues and discussions
- Review documentation in `docs/`
- Ask questions in pull request comments
- Contact maintainers for guidance

## License

By contributing to Ratio, you agree that your contributions will be subject to the project's license.

---

Thank you for contributing to Ratio! 🚀
