# DocAI POC

## Prerequisites

- Ubuntu 22.04 LTS
- Docker and Docker Compose
- Python 3.10+
- 8GB RAM minimum
- 20GB free disk space

## Run Order

1. `scripts/setup_base.sh`
2. `scripts/setup_postgres_pgvector.sh`
3. `scripts/setup_python_env.sh`
4. `scripts/pull_docker_images.sh`
5. `docker-compose up -d`

## Verification

### Base setup

- Confirm `git`, `curl`, `wget`, `python3`, and Docker are installed.
- Run `docker ps` to confirm the Docker daemon is active.

### PostgreSQL and pgvector

- Connect with `psql -U docai_user -d docai_db`
- Check the extension with:

```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### Python environment

- Activate the environment with `source ~/docai_env/bin/activate`
- Verify imports with:

```bash
python -c "import fastapi, docling, presidio_analyzer, mlflow"
```

### Docker images

- Run `docker images` and confirm all 6 required images are present.

### Compose stack

- Run `docker ps` and confirm `postgres`, `weaviate`, `grafana`, and `prometheus` are running.
