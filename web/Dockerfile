# ── 1단계: 빌드 ────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# 의존성만 먼저 복사해 레이어 캐시를 살린다.
COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# ── 2단계: 정적 서빙 + API 프록시 ──────────────────────────────
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
