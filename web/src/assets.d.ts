/** vite 의 `?url` 가져오기 — 파일을 번들에 싣고 그 주소만 준다.
    tsconfig 에 vite/client 타입이 안 걸려 있어 여기서 한 줄로 선언한다.
    (pdf.js 워커처럼 제 파일로 떠야 하는 것을 CDN 없이 싣는 길 — 이 망은
    바깥에 안 나간다.) */
declare module '*?url' {
  const url: string
  export default url
}
