python3 -m venv ~/docai_env
source ~/docai_env/bin/activate
pip install fastapi "uvicorn[standard]" psycopg2-binary sqlalchemy pydantic
pip install unstructured docling transformers torch torchvision torchaudio
pip install tesseract pytesseract pillow presidio-analyzer presidio-anonymizer
pip install mlflow weaviate-client langchain llama-index
pip install sentence-transformers prometheus-client python-jose[cryptography] passlib[bcrypt] python-multipart
pip install pgvector
pip install requests python-docx reportlab pdf2image
pip install pytest
pip install httpx
