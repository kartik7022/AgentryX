sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE EXTENSION IF NOT EXISTS vector;"
sudo -u postgres createuser -s docai_user
sudo -u postgres createdb docai_db -O docai_user
# Verify: sudo -u postgres psql -c "\dx" should show pgvector
