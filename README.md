# AI Task Processing Platform

A production-ready microservices platform for asynchronous AI task processing, built with MERN stack, Python worker, Docker, Kubernetes, Argo CD (GitOps), and GitHub Actions CI/CD.

---

## Architecture Overview

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Browser   │────▶   Frontend  │    │  Argo CD    │
│             │    │  React/Nginx│    │  (GitOps)   │
└─────────────┘    └──────┬──────┘    └──────┬──────┘
                          │ HTTP              │ sync
                   ┌──────▼──────┐    ┌──────▼──────┐
                   │   Backend   │    │  Kubernetes │
                   │ Node/Express│    │   Cluster   │
                   └──┬──────────┘    └─────────────┘
                      │  JWT Auth
              ┌───────┼───────┐
              ▼       ▼       ▼
         ┌────────┐ ┌──────┐ ┌──────────┐
         │MongoDB │ │Redis │ │  Worker  │
         │        │ │Queue │ │ (Python) │
         └────────┘ └──────┘ └──────────┘
```

**Task Lifecycle:**
```
POST /tasks → MongoDB (pending) → Redis Queue → Worker picks up
→ MongoDB (running) → Process text → MongoDB (success/failed)
```

---

## Project Structure

```
ai-task-platform/
├── frontend/               # React SPA
│   ├── src/
│   │   ├── pages/          # AuthPage, DashboardPage, TaskDetailPage
│   │   ├── context/        # AuthContext (JWT state)
│   │   └── utils/          # Axios instance
│   ├── nginx.conf          # SPA routing + proxy config
│   └── Dockerfile          # Multi-stage: Node build → Nginx serve
│
├── backend/                # Express REST API
│   ├── src/
│   │   ├── models/         # User, Task (Mongoose)
│   │   ├── routes/         # auth.js, tasks.js
│   │   ├── middleware/      # auth.js (JWT), errorHandler.js
│   │   └── config/         # database.js, redis.js, logger.js
│   └── Dockerfile
│
├── worker/                 # Python background processor
│   ├── worker.py           # Redis BLPOP consumer
│   └── Dockerfile
│
├── k8s/base/               # Kubernetes manifests
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml
│   ├── mongo.yaml
│   ├── redis.yaml
│   ├── backend.yaml
│   ├── worker.yaml         # Includes HPA
│   ├── frontend.yaml
│   └── ingress.yaml
│
├── infra-repo/             # GitOps repository (deploy separately)
│   └── apps/
│       └── argocd-app.yaml
│
├── .github/workflows/
│   └── ci-cd.yml           # Lint → Build → Push → Update infra
│
└── docker-compose.yml      # Local development
```

---

## Quick Start (Local Development)

### Prerequisites
- Docker Desktop with Docker Compose
- Node.js 20+ (for local dev without Docker)

### 1. Clone the repo
```bash
git clone https://github.com/your-org/ai-task-platform.git
cd ai-task-platform
```

### 2. Start all services
```bash
docker-compose up --build
```

### 3. Access the app
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- API Health: http://localhost:5000/health

### 4. Scale workers (optional)
```bash
docker-compose up --scale worker=3
```

---

## Environment Variables

### Backend (`.env`)
| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `5000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/ai-task-platform` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `JWT_SECRET` | **Must be strong in production** | — |
| `JWT_EXPIRES_IN` | Token expiry | `7d` |
| `FRONTEND_URL` | CORS allowed origin | `http://localhost:3000` |

### Worker
| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `REDIS_HOST` | Redis host |
| `LOG_LEVEL` | Python log level (`INFO`, `DEBUG`) |

---

## API Reference

### Authentication

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/api/auth/register` | `{ email, password }` | Create account |
| POST | `/api/auth/login` | `{ email, password }` | Get JWT token |

### Tasks (JWT required)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/tasks` | Create and queue task |
| GET | `/api/tasks` | List user's tasks (paginated) |
| GET | `/api/tasks/:id` | Task details with result and logs |

**Supported operations:** `uppercase`, `lowercase`, `reverse`, `word_count`

**Create Task Payload:**
```json
{
  "title": "Process Feedback",
  "inputText": "Hello World",
  "operation": "uppercase"
}
```

---

## Kubernetes Deployment

### Prerequisites
- kubectl configured for your cluster
- nginx-ingress controller installed
- cert-manager installed (optional, for TLS)

### 1. Apply all manifests
```bash
kubectl apply -f k8s/base/namespace.yaml
kubectl apply -f k8s/base/configmap.yaml
kubectl apply -f k8s/base/secrets.yaml      # Update values first!
kubectl apply -f k8s/base/mongo.yaml
kubectl apply -f k8s/base/redis.yaml
kubectl apply -f k8s/base/backend.yaml
kubectl apply -f k8s/base/worker.yaml
kubectl apply -f k8s/base/frontend.yaml
kubectl apply -f k8s/base/ingress.yaml
```

Or all at once:
```bash
kubectl apply -f k8s/base/
```

### 2. Verify deployment
```bash
kubectl get pods -n ai-task-platform
kubectl get svc -n ai-task-platform
kubectl get ingress -n ai-task-platform
```

### 3. Update secrets (IMPORTANT)
```bash
# Encode your real JWT secret
echo -n "your-strong-secret-here" | base64

# Edit and apply
kubectl edit secret app-secrets -n ai-task-platform
```

---

## GitOps Setup (Argo CD)

### 1. Install Argo CD
```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

### 2. Create a separate infra repo
Create a new repo `your-org/ai-task-platform-infra` and copy `k8s/base/` manifests into `manifests/`.

### 3. Apply Argo CD Application
```bash
# Update repoURL in infra-repo/apps/argocd-app.yaml first
kubectl apply -f infra-repo/apps/argocd-app.yaml
```

### 4. Access Argo CD UI
```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Get initial password:
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

---

## CI/CD Setup (GitHub Actions)

Add these secrets to your GitHub repository:

| Secret | Description |
|---|---|
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token |
| `INFRA_REPO_TOKEN` | GitHub PAT with write access to infra repo |

**Flow:**
1. Push to `main` → Lint checks run
2. Docker images built and pushed to Docker Hub with SHA tag
3. CI updates image tags in infra repo
4. Argo CD detects infra repo change → auto-syncs cluster

---

## Production Checklist

- [ ] Replace `JWT_SECRET` with a strong random string (32+ chars)
- [ ] Enable Redis password authentication
- [ ] Set up MongoDB authentication
- [ ] Configure TLS via cert-manager
- [ ] Update `FRONTEND_URL` to your real domain
- [ ] Replace Docker Hub username in all YAML manifests
- [ ] Update `repoURL` in Argo CD app manifest
- [ ] Review resource limits and adjust for your load
- [ ] Set up MongoDB backups (e.g., MongoDB Atlas or Velero)
- [ ] Configure monitoring (Prometheus + Grafana)
- [ ] Set up log aggregation (ELK or Loki)
