# 실행기 — 화면과 같은 runner.ts·judge.ts 를 Node 로 돌린다.
#
# 판정기를 파이썬으로 다시 짜지 않았다. 두 벌이면 규칙을 고칠 때마다
# 양쪽을 맞춰야 하고, 어긋나는 순간 같은 시험이 화면마다 다른 결과를 낸다.
FROM node:22-alpine AS build
WORKDIR /build
COPY runner/package.json runner/
RUN cd runner && npm install --no-audit --no-fund
COPY web/src web/src
COPY web/tsconfig.json web/
COPY runner runner
RUN cd runner && npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /build/runner/dist/main.js ./main.js
# 실행기는 장비에 직접 붙지 않는다 — API 를 통해 붙는다. 그래서 여기에는
# ssh 도 telnet 도 필요 없다.
CMD ["node", "main.js"]
