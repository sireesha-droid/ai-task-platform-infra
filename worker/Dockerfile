# ─── Stage 1: Build Dependencies ─────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# ─── Stage 2: Production Image ────────────────────────────────────────────────
FROM python:3.12-slim AS runner

# Security: non-root user
RUN addgroup --gid 1001 appgroup && \
    adduser --uid 1001 --gid 1001 --no-create-home --disabled-password appuser

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /root/.local /home/appuser/.local
ENV PATH=/home/appuser/.local/bin:$PATH

# Copy worker source
COPY --chown=appuser:appgroup worker.py .

USER appuser

# Unbuffered output ensures logs appear immediately
ENV PYTHONUNBUFFERED=1

CMD ["python", "worker.py"]
