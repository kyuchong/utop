# 고객사 소개 덱 생성기

`docs/UTOP_소개.pptx` 를 만든다. 16:9, 16장, 발표자 노트 포함.

```bash
cd tools/pptx-intro
npm install
node build.js ../../docs/UTOP_소개.pptx
```

내용을 고치려면 `build.js` 의 해당 장(`// N. …` 주석)을 고치고 다시 돌린다.
