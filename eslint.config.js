// ESLint flat config (v9+ 스타일). frontend/static/js/ 만 대상.
// no-undef 활성화: 오타로 만든 미정의 참조를 잡는 핵심 규칙.
//
// tools/eslint/globals.json 는 생성물. 직접 수정 금지.
// 갱신: python tools/gen_eslint_globals.py
// 수동 추가 심볼(CDN 라이브러리 등)은 tools/eslint/globals.extra.json 에.
//   (앱 자산이 아니라 린트 도구만 읽는 메타데이터라 frontend/ 가 아닌 tools/ 에 둔다)
const js = require("@eslint/js");
const globals = require("globals");
const projectGlobals = require("./tools/eslint/globals.json");

const projectGlobalsMap = Object.fromEntries(projectGlobals.map((n) => [n, "writable"]));

module.exports = [
  {
    files: ["frontend/static/js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...projectGlobalsMap,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-undef": "error",
      // globals 로 등록된 심볼과 파일 내 var/let/const 선언이 겹치는 것은 무시
      // (파일 간 참조를 위해 globals 에 넣은 것이지, 재선언 금지 의도가 아님)
      "no-redeclare": ["error", { "builtinGlobals": false }],
      // 미사용: 파일 간 참조되는 최상위 심볼(파일 스코프론 미사용이지만 다른 파일이 씀)이
      // 다수라 vars: "local" 로 지역만 대상. 인자·catch e 도 신경 안 쓰고,
      // 의도적 미사용은 _ 접두사로 표시.
      "no-unused-vars": ["error", {
        vars: "local",
        args: "none",
        caughtErrors: "none",
        varsIgnorePattern: "^_",
      }],
      // no-empty: 빈 블록 다수(1,372건) — 기술 부채. docs/conventions.md 참조.
      "no-empty": "off",
    },
  },
];
