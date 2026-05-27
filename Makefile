# ─── AI Task Platform — Makefile ──────────────────────────────────────────────
# Usage: make <target>
# Requires: Docker Desktop running

.PHONY: help up down build logs ps clean restart status shell-backend shell-worker

# Default target
help:
	@echo ""
	@echo "  AI Task Platform — Available Commands"
	@echo "  ────────────────────────────────────────"
	@echo "  make up          Start all services (build if needed)"
	@echo "  make up-fresh    Force rebuild all images and start"
	@echo "  make down        Stop all services"
	@echo "  make restart     Restart all services"
	@echo "  make build       Build all Docker images"
	@echo "  make logs        Tail logs from all services"
	@echo "  make logs-b      Tail backend logs only"
	@echo "  make logs-w      Tail worker logs only"
	@echo "  make logs-f      Tail frontend logs only"
	@echo "  make ps          Show running containers and health"
	@echo "  make status      Show service health summary"
	@echo "  make clean       Stop and remove containers, volumes, images"
	@echo "  make scale-up    Scale workers to 3 replicas"
	@echo "  make shell-backend  Open shell in backend container"
	@echo "  make shell-worker   Open shell in worker container"
	@echo "  make shell-mongo    Open MongoDB shell"
	@echo "  make shell-redis    Open Redis CLI"
	@echo "  make test-api    Run quick API smoke tests"
	@echo ""

# ─── Core ─────────────────────────────────────────────────────────────────────

up:
	docker compose up --build -d
	@echo ""
	@echo "  ✅ Services starting..."
	@echo "  🌐 Frontend  → http://localhost:3000"
	@echo "  🔌 Backend   → http://localhost:5000"
	@echo "  🏥 Health    → http://localhost:5000/health"
	@echo ""
	@echo "  Run 'make logs' to watch logs or 'make ps' to check status"

up-fresh:
	docker compose down --volumes
	docker compose build --no-cache
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart

build:
	docker compose build

# ─── Logs ─────────────────────────────────────────────────────────────────────

logs:
	docker compose logs -f

logs-b:
	docker compose logs -f backend

logs-w:
	docker compose logs -f worker

logs-f:
	docker compose logs -f frontend

# ─── Status ───────────────────────────────────────────────────────────────────

ps:
	docker compose ps

status:
	@echo "── Container Status ──────────────────────────────────────"
	@docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
	@echo ""
	@echo "── Backend Health ────────────────────────────────────────"
	@curl -s http://localhost:5000/health | python3 -m json.tool 2>/dev/null || echo "Backend not ready yet"

# ─── Scaling ──────────────────────────────────────────────────────────────────

scale-up:
	docker compose up -d --scale worker=3
	@echo "Workers scaled to 3 replicas"

scale-down:
	docker compose up -d --scale worker=1

# ─── Shells ───────────────────────────────────────────────────────────────────

shell-backend:
	docker compose exec backend sh

shell-worker:
	docker compose exec worker sh

shell-mongo:
	docker compose exec mongo mongosh ai-task-platform

shell-redis:
	docker compose exec redis redis-cli

# ─── Cleanup ──────────────────────────────────────────────────────────────────

clean:
	docker compose down --volumes --remove-orphans
	docker image rm -f atp-backend atp-worker atp-frontend 2>/dev/null || true
	@echo "All containers, volumes, and images removed"

# ─── Smoke Tests ──────────────────────────────────────────────────────────────

test-api:
	@echo "── Health Check ──────────────────────────────────────────"
	@curl -sf http://localhost:5000/health && echo " ✅ Backend healthy" || echo " ❌ Backend not reachable"
	@echo ""
	@echo "── Register Test User ────────────────────────────────────"
	@curl -sf -X POST http://localhost:5000/api/auth/register \
		-H "Content-Type: application/json" \
		-d '{"email":"test@demo.com","password":"password123"}' | python3 -m json.tool
	@echo ""
	@echo "  Done. Check output above for token — use it in 'make test-task'"

test-task:
	@echo "Set TOKEN variable first: export TOKEN=<your-jwt-from-register>"
	@curl -sf -X POST http://localhost:5000/api/tasks \
		-H "Content-Type: application/json" \
		-H "Authorization: Bearer $$TOKEN" \
		-d '{"title":"Demo Task","inputText":"Hello World from the AI Task Platform","operation":"uppercase"}' \
		| python3 -m json.tool
