# ============================================================================
# Multi-stage Dockerfile for Stellar-Veriphy
# ============================================================================
# Stage 1: Build Soroban contracts
# Stage 2: Build frontend and create final image
# ============================================================================

# ============================================================================
# Stage 1: Contract Builder
# ============================================================================
FROM rust:1.75-slim as contract-builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Add wasm32 target for Soroban contracts
RUN rustup target add wasm32-unknown-unknown

# Set working directory
WORKDIR /build

# Copy contract source files
COPY contracts/ ./contracts/

# Build Oracle contract
WORKDIR /build/contracts/oracle
RUN cargo build --target wasm32-unknown-unknown --release

# Build Provenance contract
WORKDIR /build/contracts/provenance
RUN cargo build --target wasm32-unknown-unknown --release

# Build Registry contract
WORKDIR /build/contracts/registry
RUN cargo build --target wasm32-unknown-unknown --release

# ============================================================================
# Stage 2: Frontend Builder and Runtime
# ============================================================================
FROM node:20-slim as frontend-builder

# Install pnpm
RUN npm install -g pnpm@10.18.2

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY frontend/package.json ./frontend/
COPY packages/shared/package.json ./packages/shared/ 2>/dev/null || true

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY frontend/ ./frontend/
COPY packages/ ./packages/ 2>/dev/null || true
COPY tsconfig.base.json ./

# Copy built contracts from previous stage
COPY --from=contract-builder /build/contracts/oracle/target/wasm32-unknown-unknown/release/*.wasm ./contracts/oracle/target/wasm32-unknown-unknown/release/
COPY --from=contract-builder /build/contracts/provenance/target/wasm32-unknown-unknown/release/*.wasm ./contracts/provenance/target/wasm32-unknown-unknown/release/
COPY --from=contract-builder /build/contracts/registry/target/wasm32-unknown-unknown/release/*.wasm ./contracts/registry/target/wasm32-unknown-unknown/release/

# Build frontend
RUN pnpm build:frontend

# ============================================================================
# Stage 3: Production Runtime
# ============================================================================
FROM node:20-slim as runtime

# Install pnpm
RUN npm install -g pnpm@10.18.2

# Create app user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Set working directory
WORKDIR /app

# Copy package files
COPY --chown=appuser:appuser package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --chown=appuser:appuser frontend/package.json ./frontend/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built frontend from builder stage
COPY --from=frontend-builder --chown=appuser:appuser /app/frontend/.next ./frontend/.next
COPY --from=frontend-builder --chown=appuser:appuser /app/frontend/public ./frontend/public
COPY --from=frontend-builder --chown=appuser:appuser /app/frontend/next.config.js ./frontend/ 2>/dev/null || true
COPY --from=frontend-builder --chown=appuser:appuser /app/frontend/next.config.mjs ./frontend/ 2>/dev/null || true

# Copy built contracts
COPY --from=contract-builder --chown=appuser:appuser /build/contracts/oracle/target/wasm32-unknown-unknown/release/*.wasm ./contracts/oracle/
COPY --from=contract-builder --chown=appuser:appuser /build/contracts/provenance/target/wasm32-unknown-unknown/release/*.wasm ./contracts/provenance/
COPY --from=contract-builder --chown=appuser:appuser /build/contracts/registry/target/wasm32-unknown-unknown/release/*.wasm ./contracts/registry/

# Startup diagnostics and readiness probe (see DOCKER.md#startup-diagnostics)
COPY --chown=appuser:appuser docker/entrypoint.sh docker/healthcheck.mjs /app/docker/
RUN chmod +x /app/docker/entrypoint.sh \
    && mkdir -p /app/frontend/.data \
    && chown appuser:appuser /app/frontend/.data

# Switch to non-root user
USER appuser

# Expose port 3000
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV VERIPHY_DATA_DIR=/app/frontend/.data

# Health check: readiness probe that reports which check failed
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD ["node", "/app/docker/healthcheck.mjs"]

# Start the application (entrypoint validates config and logs diagnostics first)
WORKDIR /app/frontend
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["pnpm", "start"]
