// 화면과 **같은** runner.ts·judge.ts 를 Node 용으로 묶는다.
// `@/api/client` 만 실행기용 shim 으로 바꿔 끼운다 — 그 파일 하나가
// 브라우저와 서버의 유일한 차이다.
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync, statSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const alias = {
  name: 'utop-alias',
  setup(b) {
    b.onResolve({ filter: /^@\/api\/client$/ }, () => ({ path: resolve(here, 'src/api.ts') }))
    b.onResolve({ filter: /^@\// }, (a) => {
      // 화면 코드는 확장자를 안 적는다. 있는 것을 골라 준다.
      const base = resolve(here, '../web/src', a.path.slice(2))
      for (const c of [base, base + '.ts', base + '.tsx', base + '/index.ts']) {
        if (existsSync(c) && statSync(c).isFile()) return { path: c }
      }
      return { path: base }
    })
  },
}

await build({
  entryPoints: [resolve(here, 'src/main.ts')],
  outfile: resolve(here, 'dist/main.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  plugins: [alias],
  logLevel: 'info',
})
