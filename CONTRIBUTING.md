# Contributing

Thank you for contributing to VaultPilot Indexer.

## Development setup

1. Install dependencies:

```bash
npm install
```

2. Run static checks:

```bash
npm run typecheck
npm test
```

3. Build plugin bundle:

```bash
npm run build
```

## Coding rules

- Keep changes small and focused.
- Add tests for new behavior.
- Keep plugin behavior read-only for user note content.
- Do not commit secrets or API keys.

## Pull request checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] Documentation updated when behavior changes
- [ ] Changelog updated for user-visible changes
