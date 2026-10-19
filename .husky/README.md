# Git Hooks with Husky

This directory contains Git hooks managed by [Husky](https://typicode.github.io/husky/) to ensure code quality before commits and pushes.

## Available Hooks

### pre-commit

**Purpose**: Lint, format, and type-check staged files before committing

**What it does**:

- Runs `lint-staged` on staged files
- Automatically fixes ESLint errors in TypeScript/TSX files
- Formats code with Prettier
- Formats Rust files with rustfmt
- Runs TypeScript type checking on entire project
- Prevents commits with linting or type errors

**Files affected**:

- `frontend/**/*.{ts,tsx}` - ESLint with auto-fix + Prettier
- `contracts/**/*.rs` - Rustfmt formatting
- `**/*.{js,json,css,md,yml,yaml}` - Prettier formatting

**How it works**:

```bash
# When you run: git commit
# Husky automatically runs:
# 1. npx lint-staged (lint and format staged files)
# 2. pnpm typecheck (type check entire project)
```

**Configuration**: See `lint-staged` section in root `package.json`

**Prevents commits if**:

- Linting errors are detected
- Type check fails

---

### pre-push

**Purpose**: Build frontend to catch errors before pushing

**What it does**:

- Runs `pnpm build:frontend`
- Fails the push if build errors are detected
- Ensures only working code is pushed to remote

**How it works**:

```bash
# When you run: git push
# Husky automatically runs: pnpm build:frontend
```

**Output**:

- ✅ Success: Push proceeds
- ❌ Failure: Push is blocked, fix errors first

---

## Setup

Hooks are automatically installed when you run:

```bash
pnpm install
```

This triggers the `prepare` script in `package.json` which runs `husky`.

## Skipping Hooks

### Skip pre-commit (not recommended)

```bash
git commit --no-verify
# or
git commit -n
```

### Skip pre-push (not recommended)

```bash
git push --no-verify
# or
git push -n
```

**Warning**: Skipping hooks may result in CI failures. Only skip when absolutely necessary.

## Disabling Hooks Temporarily

Set the `HUSKY` environment variable to `0`:

```bash
# Disable for one command
HUSKY=0 git commit -m "message"

# Disable for current shell session
export HUSKY=0
git commit -m "message"
git push

# Re-enable
unset HUSKY
```

## Troubleshooting

### Hooks not running

**Issue**: Hooks don't execute on commit/push

**Solutions**:

1. **Reinstall Husky**:

   ```bash
   pnpm install
   ```

2. **Check hook permissions**:

   ```bash
   ls -la .husky/
   # pre-commit and pre-push should be executable (-rwxr-xr-x)
   ```

3. **Make hooks executable**:

   ```bash
   chmod +x .husky/pre-commit
   chmod +x .husky/pre-push
   ```

4. **Check Git hooks path**:
   ```bash
   git config core.hooksPath
   # Should output: .husky
   ```

---

### lint-staged fails

**Issue**: `npx lint-staged` fails with errors

**Solutions**:

1. **Check ESLint configuration**:

   ```bash
   cd frontend
   pnpm lint
   ```

2. **Fix linting errors manually**:

   ```bash
   cd frontend
   pnpm lint --fix
   ```

3. **Check staged files**:
   ```bash
   git diff --cached --name-only
   ```

---

### pre-push build fails

**Issue**: Frontend build fails during push

**Solutions**:

1. **Build locally to see errors**:

   ```bash
   pnpm build:frontend
   ```

2. **Fix TypeScript errors**:
   - Check error messages
   - Fix type issues
   - Ensure all imports are correct

3. **Test build before pushing**:
   ```bash
   pnpm build:frontend
   git push
   ```

---

### Hooks run but changes aren't applied

**Issue**: lint-staged runs but files aren't fixed

**Solution**:

Lint-staged only fixes **staged** files. After auto-fix:

```bash
# Check if files were modified
git status

# Stage the fixed files
git add .

# Commit again
git commit -m "your message"
```

---

## Customization

### Modify lint-staged configuration

Edit the `lint-staged` section in root `package.json`:

```json
{
  "lint-staged": {
    "frontend/**/*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write" // Add prettier
    ],
    "contracts/**/*.rs": ["rustfmt --edition 2021"],
    "**/*.md": [
      "prettier --write" // Format markdown
    ]
  }
}
```

### Add more hooks

Create new hook files in `.husky/`:

```bash
# Example: commit-msg hook
echo '#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Validate commit message format
npx commitlint --edit $1
' > .husky/commit-msg

chmod +x .husky/commit-msg
```

### Modify existing hooks

Edit `.husky/pre-commit` or `.husky/pre-push` directly.

---

## Best Practices

1. **Don't skip hooks**: They catch errors early
2. **Fix issues locally**: Don't rely on CI to catch everything
3. **Test before pushing**: Run `pnpm build:frontend` manually
4. **Keep hooks fast**: Slow hooks frustrate developers
5. **Document changes**: Update this README when modifying hooks

---

## Hook Execution Flow

### pre-commit

```
git commit
    ↓
.husky/pre-commit
    ↓
npx lint-staged
    ↓
ESLint --fix (*.ts, *.tsx)
rustfmt (*.rs)
    ↓
Success? → Commit proceeds
Failure? → Commit blocked
```

### pre-push

```
git push
    ↓
.husky/pre-push
    ↓
pnpm build:frontend
    ↓
Success? → Push proceeds
Failure? → Push blocked
```

---

## Related Documentation

- [Husky Documentation](https://typicode.github.io/husky/)
- [lint-staged Documentation](https://github.com/okonet/lint-staged)
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Development guidelines
- [.github/CI_QUICK_REFERENCE.md](../.github/CI_QUICK_REFERENCE.md) - CI commands

---

## FAQ

**Q: Why do hooks run automatically?**  
A: Husky installs Git hooks during `pnpm install` to ensure code quality.

**Q: Can I disable hooks permanently?**  
A: Not recommended. Hooks prevent CI failures and maintain code quality.

**Q: What if I need to commit broken code?**  
A: Use `git commit --no-verify` sparingly. Fix issues before pushing.

**Q: Do hooks run in CI?**  
A: No. CI has its own checks. Hooks are for local development.

**Q: How do I update hooks?**  
A: Edit files in `.husky/` and commit changes.

---

**Last Updated**: June 1, 2026
