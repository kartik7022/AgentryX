# DocAI Fresher Runbook

## Prerequisites Checklist
- [ ] Ubuntu 22.04 LTS or macOS 13+ or WSL2
- [ ] Python 3.10+ - `python3 --version`
- [ ] Docker Desktop running - `docker ps`
- [ ] Node.js 18+ - `node --version`
- [ ] Git - `git --version`
- [ ] 8GB RAM minimum, 20GB disk space

## Step 1: Batch 1 - Environment Setup (30 min)
```bash
bash scripts/setup_base.sh
bash scripts/setup_postgres_pgvector.sh
bash scripts/setup_python_env.sh
bash scripts/pull_docker_images.sh
docker-compose up -d
```
Verify: `docker ps` shows the expected containers running.

## Step 2: Run Database Migrations (5 min)
```bash
bash scripts/run_migrations.sh
```
Verify: `SELECT COUNT(*) FROM document_types;` returns `10+`.

## Step 3: Batch 2 - Start FastAPI Service (2 min)
```bash
source ~/docai_env/bin/activate
export JWT_SECRET_KEY=your-secret-key-here
export POSTGRES_HOST=localhost
export POSTGRES_USER=docai_user
export POSTGRES_PASSWORD=docai_pass
export POSTGRES_DB=docai_db
export MOCK_TRAINING=true
cd ~/docai_service
uvicorn app.main:app --reload --port 8000
```
Verify: open `http://localhost:8000/docs` and confirm the API endpoints are visible.

## Step 4: Batch 3 - Start MLflow (2 min)
```bash
bash scripts/start_mlflow.sh
```
Verify: `http://localhost:5000` loads the MLflow UI.

## Step 5: Generate Test Fixtures (2 min)
```bash
python scripts/generate_fixtures.py
```
Verify: `ls tests/fixtures/` shows `sample_invoice.pdf`, `sample_resume.pdf`, `sample_claim.txt`, `sample_medical_record.txt`, and `sample_passport.txt`.

## Step 6: Run All Tests (10 min)
```bash
pytest tests/ -v --tb=short
```
Verify: the full suite is green.

## Step 7: Start UI (3 min)
```bash
cd docai-ui
npm install
npm start
```
Verify: `http://localhost:3000` shows the DocAI login page.

## Step 8: Manual End-to-End Test
1. Login at `http://localhost:3000` using your admin credentials.
2. Go to `Doc Types`, choose `Train New`, and enter invoice fields plus sample text.
3. Submit the form and copy the returned `doc_id`.
4. Go to `Parse Document`, enter the `doc_id`, upload `tests/fixtures/sample_invoice.pdf`, and click `Parse`.
5. Confirm the result panel shows extracted fields, confidence, intent, and `audit_id`.

## Troubleshooting
- Container not starting -> `docker logs <container_name>`
- `pgvector` missing -> `sudo apt install postgresql-15-pgvector`
- Port `8000` in use -> `lsof -i :8000 | kill -9 <PID>`
- JWT error -> ensure `JWT_SECRET_KEY` is exported before starting FastAPI
- MLflow not found -> rerun `bash scripts/start_mlflow.sh`
- Python import error -> confirm `source ~/docai_env/bin/activate` was run
