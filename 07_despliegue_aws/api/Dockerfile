FROM python:3.11-slim

WORKDIR /var/task

COPY requirements.txt .
RUN pip install --no-cache-dir --only-binary=:all: -r requirements.txt

COPY app/ ./app/

ENTRYPOINT ["python", "-m", "awslambdaric"]
CMD ["app.main.handler"]