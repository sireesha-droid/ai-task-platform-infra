# 🚀 QUICKSTART — Run in 3 Commands

## What You Need (Prerequisites)

| Tool | Version | Download |
|------|---------|---------|
| **Docker Desktop** | Latest | https://www.docker.com/products/docker-desktop/ |
| **Docker Compose** | v2+ (included in Docker Desktop) | ↑ same |
| **make** | Any | Included on Mac/Linux. Windows: use Git Bash or WSL |

> **Windows users:** Use **WSL 2** (Windows Subsystem for Linux) or **Git Bash** for all commands.

---

## ⚡ Run Locally (Docker Compose) — Fastest Path

### Step 1 — Extract and enter the project
```bash
unzip ai-task-platform.zip
cd ai-task-platform
```

### Step 2 — Start everything
```bash
make up
# OR if you don't have make:
docker compose up --build -d
```

This builds and starts **5 containers**:
- `atp-frontend`  — React UI (Nginx)
- `atp-backend`   — Node.js API
- `atp-worker`    — Python task processor
- `atp-mongo`     — MongoDB
- `atp-redis`     — Redis queue

First run takes **3–5 minutes** to build images. Subsequent starts take ~10 seconds.

### Step 3 — Open the app
```
http://localhost:3000
```

**Register → Create a task → Watch it process in real time.**

---

## 📋 Useful Commands

```bash
make ps          # See all containers and their health status
make logs        # Tail all logs
make logs-b      # Backend logs only
make logs-w      # Worker logs only
make status      # Health check summary
make down        # Stop everything
make clean       # Stop + remove all data (fresh start)
make scale-up    # Run 3 worker replicas in parallel
make shell-mongo # Open MongoDB shell
make shell-redis # Open Redis CLI
```

---

## 🌍 Access Points

| Service | URL | Notes |
|---------|-----|-------|
| **Frontend (UI)** | http://localhost:3000 | Main app — use this |
| **Backend API** | http://localhost:5000/api | REST API |
| **API Health** | http://localhost:5000/health | Check if backend is up |
| **MongoDB** | localhost:27017 | Connect with MongoDB Compass |
| **Redis** | localhost:6379 | Connect with RedisInsight |

---

## 🔧 Quick API Test (curl)

```bash
# 1. Register a user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@test.com","password":"password123"}'

# Copy the "token" from the response, then:
export TOKEN="paste-your-token-here"

# 2. Create a task
curl -X POST http://localhost:5000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"My First Task","inputText":"Hello World","operation":"uppercase"}'

# 3. List your tasks
curl http://localhost:5000/api/tasks \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🛠 Troubleshooting

### Containers won't start?
```bash
# Make sure Docker Desktop is running, then:
docker compose down
docker compose up --build -d
```

### Port already in use?
```bash
# Check what's on port 3000 or 5000:
lsof -i :3000   # Mac/Linux
netstat -ano | findstr :3000   # Windows

# Or change ports in docker-compose.yml:
# "3001:80" for frontend, "5001:5000" for backend
```

### Frontend shows "Cannot connect to API"?
The frontend is built with `REACT_APP_API_URL=http://localhost:5000/api` baked in at Docker build time. If you change the backend port you must rebuild:
```bash
docker compose build frontend
docker compose up -d frontend
```

### Task stays "pending" forever?
The worker might not have started. Check:
```bash
make logs-w
# or
docker compose logs worker
```

### Fresh start (nuke everything):
```bash
make clean
make up
```

---

## 🐳 Run Without `make` (Pure Docker Compose)

```bash
# Start
docker compose up --build -d

# Stop
docker compose down

# Logs
docker compose logs -f

# Scale workers
docker compose up -d --scale worker=3

# Rebuild one service
docker compose build backend
docker compose up -d backend
```

---

## ☸️ Kubernetes Deployment (Advanced)

Only needed for production/cloud. Requires a running Kubernetes cluster.

```bash
# 1. Apply all manifests
kubectl apply -f k8s/base/

# 2. Check pods
kubectl get pods -n ai-task-platform

# 3. Watch them come up
kubectl get pods -n ai-task-platform -w
```

See **README.md** for full Kubernetes + Argo CD + CI/CD setup instructions.

---

## 📁 What's in the Zip

```
ai-task-platform/
├── frontend/          React app (UI)
├── backend/           Node.js + Express API
├── worker/            Python Redis consumer
├── k8s/               Kubernetes manifests
├── .github/workflows/ GitHub Actions CI/CD
├── infra-repo/        Argo CD GitOps config
├── docker-compose.yml Local dev — START HERE
├── Makefile           Convenience commands
├── QUICKSTART.md      ← You are here
├── README.md          Full documentation
└── ARCHITECTURE.md    Design decisions & scaling
```

---

## ✅ Tested On

| OS | Docker Version | Status |
|----|---------------|--------|
| macOS 14 (Apple Silicon) | Docker Desktop 4.28 | ✅ Works |
| macOS 13 (Intel) | Docker Desktop 4.28 | ✅ Works |
| Ubuntu 22.04 | Docker Engine 25.0 | ✅ Works |
| Windows 11 + WSL2 | Docker Desktop 4.28 | ✅ Works |
