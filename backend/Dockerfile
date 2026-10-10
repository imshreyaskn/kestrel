FROM --platform=linux/amd64 python:3.13-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

ENV PYTHONPATH=/app
COPY . ./backend

EXPOSE 8000

# Apply Alembic migrations before serving (spec §13.1: the api service runs migrations).
# alembic.ini is provided at /app/alembic.ini via the compose volume mount;
# env.py resolves the database URL from the DATABASE_URL environment variable.
CMD ["sh", "-c", "alembic -c /app/alembic.ini upgrade head && exec uvicorn backend.app.main:app --host 0.0.0.0 --port 8000"]
