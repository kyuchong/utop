import { useState } from 'react'

interface Props {
  /** 이 TC 가 고른 파일 (순서대로 뒤가 앞을 덮는다) */
  files: string[]
  /** 고를 수 있는 파일 전부 */
  all: string[]
  /** include 까지 펴서 실제로 깔린 파일 */
  used: string[]
  onChange: (next: string[]) => void
}

/**
 * 이 TC 에 붙은 파라미터 파일.
 *
 * iTest 처럼 **고른다.** 전에는 '장비 모델과 이름이 같은 파일이 자동으로
 * 붙는' 규칙이었는데, iTest 에 없는 규칙인 데다 파일 이름을 모델명과 한
 * 글자도 안 틀리게 맞춰야 도는 것을 아무도 못 알아챈다.
 *
 * 실행 줄에 둔다. 정보 탭 깊숙이 두면 지금 무엇이 깔려 있는지 모른 채
 * 스텝을 쓰게 되고, `${업링크}` 가 왜 안 바뀌는지 한참 찾는다.
 */
export default function TcParamBar({ files, all, used, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const extra = used.filter((u) => !files.includes(u))

  return (
    <span className="tc-parbar">
      <button
        className={`btn small${open ? ' primary' : ''}`}
        type="button"
        title="이 TC 에 붙일 파라미터 파일"
        onClick={() => setOpen((v) => !v)}
      >
        파라미터
        <span className="muted">
          {' · '}
          {files.length === 0 ? '없음' : files.join(', ')}
          {/* include 로 따라온 것도 세어 준다 — 안 고른 파일의 값이
              들어와 있으면 어디서 왔는지 알아야 한다 */}
          {extra.length > 0 ? ` (+${extra.length})` : ''}
        </span>
        {' ▾'}
      </button>

      {open && (
        <>
          <div className="tc-menu-back" onClick={() => setOpen(false)} />
          <div className="tc-parpanel">
            <div className="tc-parpanel-head">
              <b>파라미터 파일</b>
              <span className="muted small">뒤에 있는 것이 앞을 덮습니다</span>
            </div>

            {all.length === 0 ? (
              <div className="empty">
                파일이 없습니다.
                <br />
                <span className="muted small">
                  왼쪽 트리의 「Global Parameter」 에서 만드세요.
                </span>
              </div>
            ) : (
              <div className="tc-parlist">
                {all.map((f) => {
                  const at = files.indexOf(f)
                  const on = at >= 0
                  const inc = !on && used.includes(f)
                  return (
                    <label key={f} className={`tc-par${on ? ' on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          onChange(on ? files.filter((x) => x !== f) : [...files, f])
                        }
                      />
                      <span className="tc-par-nm">{f}</span>
                      {on && <b className="tc-par-n">{at + 1}</b>}
                      {/* 안 골랐는데 깔려 있으면 다른 파일이 include 한 것이다 */}
                      {inc && <span className="tc-par-inc">include 됨</span>}
                    </label>
                  )
                })}
              </div>
            )}

            <div className="tc-parpanel-foot">
              <span className="muted small">
                스텝에 <code>{'${이름}'}</code> 으로 씁니다
              </span>
              <span className="sp" />
              <button className="btn small" type="button" onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>
          </div>
        </>
      )}
    </span>
  )
}
