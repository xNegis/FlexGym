#!/usr/bin/env bash

set -Eeuo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
env_file=""

usage() {
    cat <<'EOF'
Usage:
  ./scripts/deploy.sh [--env-file PATH]

The environment file must define:
  APP_ENV
  DATABASE_URL
  ALLOWED_ORIGINS
  JWT_SECRET
  VITE_API_BASE_URL

If --env-file is omitted, .env is used when it exists. Otherwise,
Docker Compose reads these variables from the current shell environment and
its default .env file.
EOF
}

while (($# > 0)); do
    case "$1" in
        --env-file)
            if (($# < 2)); then
                echo "Error: --env-file requires a path." >&2
                usage >&2
                exit 2
            fi
            env_file="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Error: unknown argument: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

cd "$project_dir"

if [[ -z "$env_file" && -f .env ]]; then
    env_file=".env"
fi

compose_args=()
if [[ -n "$env_file" ]]; then
    if [[ ! -f "$env_file" ]]; then
        echo "Error: environment file not found: $env_file" >&2
        exit 1
    fi
    compose_args+=(--env-file "$env_file")
fi

echo "Validating Docker Compose configuration..."
docker compose "${compose_args[@]}" config --quiet

echo "Building and starting FlexGym..."
docker compose "${compose_args[@]}" up --build -d

backend_container="$(docker compose "${compose_args[@]}" ps -q backend)"
if [[ -z "$backend_container" ]]; then
    echo "Error: backend container was not created." >&2
    docker compose "${compose_args[@]}" logs backend >&2 || true
    exit 1
fi

echo "Waiting for the backend healthcheck..."
health=""
for _ in {1..60}; do
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$backend_container" 2>/dev/null || true)"
    case "$health" in
        healthy)
            break
            ;;
        unhealthy|exited|dead)
            echo "Error: backend is $health." >&2
            docker compose "${compose_args[@]}" logs backend >&2 || true
            exit 1
            ;;
    esac
    sleep 1
done

if [[ "$health" != "healthy" ]]; then
    echo "Error: backend did not become healthy within 60 seconds." >&2
    docker compose "${compose_args[@]}" ps >&2
    docker compose "${compose_args[@]}" logs backend >&2 || true
    exit 1
fi

echo "Checking the public application endpoints..."
curl --fail --silent --show-error --retry 5 --retry-delay 1 \
    --retry-all-errors --retry-max-time 90 \
    --resolve formcadence.app:443:127.0.0.1 \
    https://formcadence.app/api/health >/dev/null
curl --fail --silent --show-error --retry 5 --retry-delay 1 \
    --retry-all-errors --retry-max-time 90 \
    --resolve formcadence.app:443:127.0.0.1 \
    https://formcadence.app/ >/dev/null

echo "FlexGym deployed successfully."
docker compose "${compose_args[@]}" ps
