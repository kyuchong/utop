import { useState } from 'react'

interface Props {
  /** 창 제목 — 「다른 이름으로 저장」 인지 「가져오기」 인지 */
  title: string
  defaultId: string
  defaultName: string
  /** 이미 있는 TC ID. 덮어쓰는 사고를 막는다 */
  taken: Set<string>
  /** 가져오기일 때, 어느 서버에서 왔는지 등 한 줄 안내 */
  note?: string
  busy?: boolean
  onSubmit: (tcid: string, name: string) => void
  onClose: () => void
}

/**
 * 새 이름으로 만들기.
 *
 * 「다른 이름으로 저장」과 「파일에서 가져오기」가 같은 창을 쓴다. 둘 다
 * 하는 일이 같기 때문이다 — 내용은 이미 있고, 새 ID 와 제목만 정하면 된다.
 *
 * ID 가 겹치면 아예 못 누르게 한다. 덮어쓰면 남이 만든 시험이 사라지고
 * 되돌릴 수 없다.
 */
export default function TcSaveAs({
  title,
  defaultId,
  defaultName,
  taken,
  note,
  busy,
  onSubmit,
  onClose,
}: Props) {
  const [id, setId] = useState(defaultId)
  const [name, setName] = useState(defaultName)

  const trimmed = id.trim()
  const dup = taken.has(trimmed)
  const bad = !trimmed || dup

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <form
        className="modal sa"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (bad || busy) return
          onSubmit(trimmed, name.trim())
        }}
      >
        <div className="modal-head">
          <b>{title}</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="modal-body">
          {note && <div className="sa-note">{note}</div>}

          <label className="fld">
            <span>새 TC ID</span>
            <input
              autoFocus
              className="mono"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="TC-E6100-001"
            />
            {dup && <span className="sa-err">이미 있는 ID 입니다 — 덮어쓰지 않습니다</span>}
          </label>

          <label className="fld">
            <span>제목</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="시험 제목" />
          </label>
        </div>

        <div className="modal-foot">
          <span className="muted small">스텝·판정·세션이 그대로 복사됩니다.</span>
          <span className="sa-sp" />
          <button className="btn" type="button" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" type="submit" disabled={bad || busy}>
            {busy ? '만드는 중…' : '만들기'}
          </button>
        </div>
      </form>
    </div>
  )
}
