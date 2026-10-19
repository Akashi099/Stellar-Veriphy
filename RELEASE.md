# Automated Release Process

This project uses [semantic-release](https://semantic-release.gitbook.io/) to automate versioning and package releases based on commit messages.

## How It Works

Semantic-release automatically:

- Analyzes commit messages using the [Angular commit convention](https://github.com/angular/angular/blob/master/CONTRIBUTING.md#-commit-message-guidelines)
- Determines the next version number (major, minor, or patch)
- Creates a changelog with all changes since the last release
- Creates a git tag for the release
- Publishes a GitHub release
- Updates `CHANGELOG.md` and `package.json`

## Commit Message Format

Commits must follow the Angular commit convention to trigger releases:

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: A new feature (triggers MINOR version bump)
- **fix**: A bug fix (triggers PATCH version bump)
- **BREAKING CHANGE**: In the footer indicates MAJOR version bump
- **docs**: Documentation only (no version bump)
- **style**: Code style changes (no version bump)
- **refactor**: Code refactoring (no version bump)
- **perf**: Performance improvements (no version bump)
- **test**: Adding or updating tests (no version bump)
- **chore**: Maintenance tasks (no version bump)
- **ci**: CI/CD changes (no version bump)

### Examples

**New feature:**

```
feat(contracts): add new verification method
```

**Bug fix:**

```
fix(frontend): resolve memory leak in certificate list
```

**Breaking change:**

```
feat(api): redesign contract interface

BREAKING CHANGE: Old contract interface no longer supported
```

## Automated Releases

Releases are automatically triggered on push to:

- `main` - Production releases
- `beta` - Beta releases
- `alpha` - Alpha pre-releases

The release workflow:

1. Runs on every push to main/beta/alpha branches
2. Analyzes commits since last release
3. Determines version and changelog
4. Creates GitHub release and tags
5. Updates repository with version changes

## Manual Releases

To trigger a release manually (if needed):

```bash
# Install semantic-release if not already installed
pnpm install

# Run the release process
pnpm release
```

Environment variables required for manual releases:

- `GITHUB_TOKEN` - GitHub personal access token with repo and release permissions

## Release Notes

Release notes are automatically generated from:

- Commit messages
- Pull request titles and descriptions
- Labels on merged pull requests

The changelog is updated in `CHANGELOG.md` with each release.

## Branches

- **main**: Production-ready releases
- **beta**: Beta releases (prerelease versions)
- **alpha**: Alpha releases (prerelease versions)

All branches support automatic releases when commits are pushed.

## GitHub Secrets

The following secrets must be configured in the GitHub repository for automatic releases:

- `GITHUB_TOKEN` - Automatically available (provided by GitHub Actions)
- `NPM_TOKEN` - (Optional) For publishing to npm registry

## Troubleshooting

### No release created

- Check that commits follow the Angular convention
- Ensure the commit type triggers a version bump (feat, fix, or BREAKING CHANGE)
- Review GitHub Actions logs for semantic-release errors

### Release failed

- Verify GitHub token has correct permissions
- Check branch protection rules allow releases
- Ensure `package.json` and `CHANGELOG.md` are writable

## References

- [Semantic Release Documentation](https://semantic-release.gitbook.io/)
- [Angular Commit Convention](https://github.com/angular/angular/blob/master/CONTRIBUTING.md#-commit-message-guidelines)
- [Conventional Commits](https://www.conventionalcommits.org/)
