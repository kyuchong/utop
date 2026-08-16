/* Toast UI Editor 3.x 는 ESM 진입점에 타입 선언을 안 물려 놓았다
   (패키지 exports 맵에 types 누락 — 업스트림 미해결). 우리가 쓰는
   표면만 여기서 선언한다. */
declare module '@toast-ui/editor' {
  export interface ToastEditorOptions {
    el: HTMLElement
    height?: string
    minHeight?: string
    initialEditType?: 'markdown' | 'wysiwyg'
    previewStyle?: 'tab' | 'vertical'
    initialValue?: string
    placeholder?: string
    usageStatistics?: boolean
    language?: string
    plugins?: unknown[]
    events?: { change?: () => void }
    hooks?: {
      addImageBlobHook?: (
        blob: File | Blob,
        callback: (url: string, altText?: string) => void,
      ) => void
    }
  }
  export default class Editor {
    constructor(opts: ToastEditorOptions)
    getMarkdown(): string
    setMarkdown(md: string, cursorToEnd?: boolean): void
    destroy(): void
  }
}

declare module '@toast-ui/editor-plugin-color-syntax' {
  const colorSyntax: unknown
  export default colorSyntax
}

declare module '@toast-ui/editor/dist/i18n/ko-kr' {
  /* 부수효과 전용 — 한국어 리소스 등록 */
}
