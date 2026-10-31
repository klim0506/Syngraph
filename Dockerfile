FROM python:3.13-slim AS python-base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
RUN groupadd --gid 10001 syngraph \
    && useradd --uid 10001 --gid syngraph --create-home syngraph

FROM python-base AS bank
COPY demo/bank-sandbox/requirements.txt demo/bank-sandbox/requirements.txt
RUN pip install -r demo/bank-sandbox/requirements.txt
COPY demo/bank-sandbox/src demo/bank-sandbox/src
RUN mkdir -p demo/bank-sandbox/data && chown syngraph:syngraph demo/bank-sandbox/data
USER syngraph
EXPOSE 8001
CMD ["uvicorn", "app:app", "--app-dir", "demo/bank-sandbox/src", "--host", "0.0.0.0", "--port", "8001", "--root-path", "/bank"]

FROM python-base AS core
COPY product/core/pyproject.toml product/core/pyproject.toml
COPY product/core/src product/core/src
COPY product/core/rules.example.json product/core/rules.example.json
RUN pip install -e product/core \
    && mkdir -p product/core/data && chown syngraph:syngraph product/core/data
USER syngraph
EXPOSE 8000
CMD ["uvicorn", "core.api:app", "--host", "0.0.0.0", "--port", "8000", "--root-path", "/core"]

FROM core AS mcp
USER root
COPY product/mcp-server/requirements.txt product/mcp-server/requirements.txt
RUN pip install -r product/mcp-server/requirements.txt
COPY product/mcp-server/src product/mcp-server/src
USER syngraph
EXPOSE 8002
CMD ["uvicorn", "server:create_http_app", "--factory", "--app-dir", "product/mcp-server/src", "--host", "0.0.0.0", "--port", "8002", "--no-access-log"]

FROM node:24-alpine AS client-build
WORKDIR /app
COPY product/client-app/package.json product/client-app/package-lock.json ./
RUN npm ci
COPY product/client-app/index.html product/client-app/tsconfig.json product/client-app/vite.config.ts ./
COPY product/client-app/src ./src
RUN npm run build

FROM nginx:stable-alpine AS web
COPY product/client-app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=client-build /app/dist /usr/share/nginx/html
EXPOSE 80
