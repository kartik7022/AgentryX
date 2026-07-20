FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 9005 9006

CMD ["uvicorn", "llm_service:app", "--host", "0.0.0.0", "--port", "9005"]