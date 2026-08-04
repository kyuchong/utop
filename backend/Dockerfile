FROM python:3.12-slim

# netmiko/paramiko 가 장비에 붙을 때 쓰는 클라이언트, pg_dump(백업 도구용),
# Pillow 빌드에 필요한 최소 패키지.
#
# iputils-ping — Ping 스텝(`/api/ping`)이 `ping` 명령을 subprocess 로 부른다.
# slim 이미지에는 없어서 그 스텝이 늘 '[Errno 2] ping' 으로 실패했다.
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssh-client \
      telnet \
      postgresql-client \
      iputils-ping \
      curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 의존성 먼저 — 소스가 바뀌어도 이 레이어는 재사용된다.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY tools/ ./tools/
COPY db/ ./db/
# 기존 UI — backend/main.py:85 가 frontend/static 을 mount 하므로 없으면 기동이 실패한다.
# 새 UI(web/)로 화면을 다 옮기면 이 줄과 해당 mount 를 함께 지운다.
COPY frontend/ ./frontend/

# 데이터는 소스 트리가 아니라 이 경로에 쌓인다. compose 가 볼륨으로 물린다.
# (backend/main.py 의 DATA_DIR = BASE_DIR/"data" 가 여기를 가리킨다)
RUN mkdir -p /app/data

WORKDIR /app/backend
EXPOSE 8000

# /api/req 를 찌르면 안 된다 — 인증이 붙은 뒤로 401 이라 컨테이너가 영원히
# unhealthy 로 남는다. 헬스체크 전용 경로만 열어두고 그것을 본다.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -fsS http://localhost:8000/api/health >/dev/null || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
