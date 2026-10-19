# Makefile for Stellar-Veriphy Docker Operations
# ============================================================================

.PHONY: help build run stop clean dev test logs shell

# Default target
.DEFAULT_GOAL := help

# Variables
IMAGE_NAME := stellarveriphy
VERSION := latest
CONTAINER_NAME := stellarveriphy-app
DEV_CONTAINER_NAME := stellarveriphy-dev
PORT := 3000
DEV_PORT := 3001

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

# ============================================================================
# Help
# ============================================================================

help: ## Show this help message
	@echo "$(BLUE)Stellar-Veriphy Docker Commands$(NC)"
	@echo ""
	@echo "$(GREEN)Usage:$(NC)"
	@echo "  make [target]"
	@echo ""
	@echo "$(GREEN)Targets:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(BLUE)%-20s$(NC) %s\n", $$1, $$2}'

# ============================================================================
# Build Targets
# ============================================================================

build: ## Build production Docker image
	@echo "$(GREEN)Building production image...$(NC)"
	docker build -t $(IMAGE_NAME):$(VERSION) .
	@echo "$(GREEN)✓ Build complete!$(NC)"

build-dev: ## Build development Docker image
	@echo "$(GREEN)Building development image...$(NC)"
	docker build -f Dockerfile.dev -t $(IMAGE_NAME):dev .
	@echo "$(GREEN)✓ Development build complete!$(NC)"

build-no-cache: ## Build without using cache
	@echo "$(GREEN)Building without cache...$(NC)"
	docker build --no-cache -t $(IMAGE_NAME):$(VERSION) .
	@echo "$(GREEN)✓ Build complete!$(NC)"

# ============================================================================
# Run Targets
# ============================================================================

run: ## Run production container
	@echo "$(GREEN)Starting production container...$(NC)"
	docker run -d \
		--name $(CONTAINER_NAME) \
		-p $(PORT):3000 \
		--restart unless-stopped \
		$(IMAGE_NAME):$(VERSION)
	@echo "$(GREEN)✓ Container started!$(NC)"
	@echo "$(BLUE)Access at: http://localhost:$(PORT)$(NC)"

run-fg: ## Run production container in foreground
	@echo "$(GREEN)Starting production container (foreground)...$(NC)"
	docker run --rm \
		--name $(CONTAINER_NAME) \
		-p $(PORT):3000 \
		$(IMAGE_NAME):$(VERSION)

dev: ## Run development container with hot reload
	@echo "$(GREEN)Starting development container...$(NC)"
	docker compose --profile dev up dev

dev-build: ## Build and run development container
	@echo "$(GREEN)Building and starting development container...$(NC)"
	docker compose --profile dev up --build dev

# ============================================================================
# Docker Compose Targets
# ============================================================================

up: ## Start all services with docker-compose
	@echo "$(GREEN)Starting services...$(NC)"
	docker compose up -d
	@echo "$(GREEN)✓ Services started!$(NC)"

up-build: ## Build and start all services
	@echo "$(GREEN)Building and starting services...$(NC)"
	docker compose up --build -d
	@echo "$(GREEN)✓ Services started!$(NC)"

down: ## Stop and remove all services
	@echo "$(YELLOW)Stopping services...$(NC)"
	docker compose down
	@echo "$(GREEN)✓ Services stopped!$(NC)"

restart: ## Restart all services
	@echo "$(YELLOW)Restarting services...$(NC)"
	docker compose restart
	@echo "$(GREEN)✓ Services restarted!$(NC)"

# ============================================================================
# Management Targets
# ============================================================================

stop: ## Stop running container
	@echo "$(YELLOW)Stopping container...$(NC)"
	-docker stop $(CONTAINER_NAME)
	@echo "$(GREEN)✓ Container stopped!$(NC)"

start: ## Start stopped container
	@echo "$(GREEN)Starting container...$(NC)"
	docker start $(CONTAINER_NAME)
	@echo "$(GREEN)✓ Container started!$(NC)"

rm: stop ## Remove container
	@echo "$(YELLOW)Removing container...$(NC)"
	-docker rm $(CONTAINER_NAME)
	@echo "$(GREEN)✓ Container removed!$(NC)"

clean: ## Remove container and image
	@echo "$(YELLOW)Cleaning up...$(NC)"
	-docker stop $(CONTAINER_NAME) $(DEV_CONTAINER_NAME)
	-docker rm $(CONTAINER_NAME) $(DEV_CONTAINER_NAME)
	-docker rmi $(IMAGE_NAME):$(VERSION) $(IMAGE_NAME):dev
	@echo "$(GREEN)✓ Cleanup complete!$(NC)"

prune: ## Remove all unused Docker resources
	@echo "$(RED)Pruning Docker resources...$(NC)"
	docker system prune -af --volumes
	@echo "$(GREEN)✓ Prune complete!$(NC)"

# ============================================================================
# Utility Targets
# ============================================================================

logs: ## View container logs
	@echo "$(BLUE)Viewing logs (Ctrl+C to exit)...$(NC)"
	docker logs -f $(CONTAINER_NAME)

logs-dev: ## View development container logs
	@echo "$(BLUE)Viewing development logs (Ctrl+C to exit)...$(NC)"
	docker compose logs -f dev

shell: ## Open shell in running container
	@echo "$(BLUE)Opening shell...$(NC)"
	docker exec -it $(CONTAINER_NAME) sh

shell-dev: ## Open shell in development container
	@echo "$(BLUE)Opening development shell...$(NC)"
	docker compose exec dev sh

ps: ## List running containers
	@echo "$(BLUE)Running containers:$(NC)"
	@docker ps --filter "name=$(IMAGE_NAME)"

inspect: ## Inspect container
	@echo "$(BLUE)Container details:$(NC)"
	@docker inspect $(CONTAINER_NAME)

health: ## Check container health
	@echo "$(BLUE)Health status:$(NC)"
	@docker inspect $(CONTAINER_NAME) --format='{{.State.Health.Status}}'

# ============================================================================
# Test Targets
# ============================================================================

test: ## Run tests in container
	@echo "$(GREEN)Running tests...$(NC)"
	docker compose exec dev pnpm --filter frontend test

test-contracts: ## Run contract tests
	@echo "$(GREEN)Running contract tests...$(NC)"
	docker compose exec dev sh -c "cd contracts/oracle && cargo test"
	docker compose exec dev sh -c "cd contracts/provenance && cargo test"
	docker compose exec dev sh -c "cd contracts/registry && cargo test"

lint: ## Run linter in container
	@echo "$(GREEN)Running linter...$(NC)"
	docker compose exec dev pnpm --filter frontend lint

# ============================================================================
# Build Targets (Contracts)
# ============================================================================

build-contracts: ## Build contracts in container
	@echo "$(GREEN)Building contracts...$(NC)"
	docker compose exec dev pnpm build:contracts
	@echo "$(GREEN)✓ Contracts built!$(NC)"

# ============================================================================
# Info Targets
# ============================================================================

info: ## Show image and container info
	@echo "$(BLUE)Image Information:$(NC)"
	@docker images $(IMAGE_NAME)
	@echo ""
	@echo "$(BLUE)Container Information:$(NC)"
	@docker ps -a --filter "name=$(IMAGE_NAME)"

size: ## Show image size
	@echo "$(BLUE)Image Size:$(NC)"
	@docker images $(IMAGE_NAME):$(VERSION) --format "{{.Repository}}:{{.Tag}} - {{.Size}}"

# ============================================================================
# Advanced Targets
# ============================================================================

push: ## Push image to registry (requires login)
	@echo "$(GREEN)Pushing image to registry...$(NC)"
	docker push $(IMAGE_NAME):$(VERSION)
	@echo "$(GREEN)✓ Push complete!$(NC)"

pull: ## Pull image from registry
	@echo "$(GREEN)Pulling image from registry...$(NC)"
	docker pull $(IMAGE_NAME):$(VERSION)
	@echo "$(GREEN)✓ Pull complete!$(NC)"

save: ## Save image to tar file
	@echo "$(GREEN)Saving image to tar...$(NC)"
	docker save $(IMAGE_NAME):$(VERSION) -o $(IMAGE_NAME)-$(VERSION).tar
	@echo "$(GREEN)✓ Image saved to $(IMAGE_NAME)-$(VERSION).tar$(NC)"

load: ## Load image from tar file
	@echo "$(GREEN)Loading image from tar...$(NC)"
	docker load -i $(IMAGE_NAME)-$(VERSION).tar
	@echo "$(GREEN)✓ Image loaded!$(NC)"

# ============================================================================
# Quick Commands
# ============================================================================

quick-start: build run ## Build and run in one command
	@echo "$(GREEN)✓ Quick start complete!$(NC)"
	@echo "$(BLUE)Access at: http://localhost:$(PORT)$(NC)"

quick-dev: build-dev dev ## Build and run development in one command
	@echo "$(GREEN)✓ Development environment ready!$(NC)"
	@echo "$(BLUE)Access at: http://localhost:$(DEV_PORT)$(NC)"

rebuild: clean build run ## Clean, rebuild, and run
	@echo "$(GREEN)✓ Rebuild complete!$(NC)"

# ============================================================================
# CI/CD Targets
# ============================================================================

ci-build: ## Build for CI (with BuildKit)
	@echo "$(GREEN)Building for CI...$(NC)"
	DOCKER_BUILDKIT=1 docker build -t $(IMAGE_NAME):$(VERSION) .
	@echo "$(GREEN)✓ CI build complete!$(NC)"

ci-test: ## Run all tests for CI
	@echo "$(GREEN)Running CI tests...$(NC)"
	docker compose --profile dev up -d dev
	docker compose exec dev pnpm --filter frontend test
	docker compose exec dev sh -c "cd contracts/oracle && cargo test"
	docker compose exec dev sh -c "cd contracts/provenance && cargo test"
	docker compose exec dev sh -c "cd contracts/registry && cargo test"
	docker compose down
	@echo "$(GREEN)✓ CI tests complete!$(NC)"

# ============================================================================
# Contract Upgrade Safety Targets
# ============================================================================

snapshot-storage-keys: ## Snapshot DataKey variants for a contract (CONTRACT=oracle|provenance|registry)
	@echo "$(GREEN)Snapshotting storage keys for $(CONTRACT)...$(NC)"
	@bash scripts/snapshot-contract-state.sh $(CONTRACT)

upgrade-check: ## Run pre-upgrade safety checks (CONTRACT= OLD_WASM= NEW_WASM= NETWORK=testnet)
	@echo "$(GREEN)Running upgrade safety checks for $(CONTRACT)...$(NC)"
	@bash scripts/upgrade-safety-check.sh $(CONTRACT) $(OLD_WASM) $(NEW_WASM) $(NETWORK)

verify-deploy: ## Smoke-test a deployed contract (CONTRACT= CONTRACT_ID= NETWORK=testnet)
	@echo "$(GREEN)Verifying deployment of $(CONTRACT) on $(NETWORK)...$(NC)"
	@bash scripts/verify-deployment.sh $(CONTRACT) $(CONTRACT_ID) $(NETWORK)

snapshot-all: ## Snapshot all three contracts before an upgrade
	@echo "$(GREEN)Snapshotting all contracts...$(NC)"
	@bash scripts/snapshot-contract-state.sh oracle
	@bash scripts/snapshot-contract-state.sh provenance
	@bash scripts/snapshot-contract-state.sh registry
	@echo "$(GREEN)✓ All contracts snapshotted$(NC)"

upgrade-selftest: ## Run the self-test for the upgrade safety tooling (no contract build needed)
	@echo "$(GREEN)Running upgrade safety self-test...$(NC)"
	@bash scripts/tests/upgrade-safety-check.test.sh
