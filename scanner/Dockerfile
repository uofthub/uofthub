FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .

# Render sets PORT; 8080 when run by hand.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
