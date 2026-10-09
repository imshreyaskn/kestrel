FROM --platform=linux/amd64 python:3.13-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --default-timeout=100 --retries=5 -i https://mirrors.aliyun.com/pypi/simple/ --extra-index-url https://pypi.org/simple -r requirements.txt

ENV PYTHONPATH=/app
COPY . ./backend

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
