import { cfOptions, type CustomField } from '@/hooks/useCustomFields'

interface Props {
  fields: CustomField[]
  values: Record<string, unknown>
  onChange: (key: string, v: unknown) => void
}

/**
 * 커스텀 필드 입력칸.
 *
 * TC 편집과 요구사항 편집이 같은 코드를 쓴다. 둘에 따로 그리면 종류를
 * 하나 늘릴 때마다 두 군데를 고쳐야 하고, 실제로 그렇게 어긋난 적이 있다
 * (드롭다운 값이 TcForm 과 TcDetail 에 따로 박혀 있던 문제).
 *
 * 배치는 종류가 정한다 — 여러 줄 글은 한 줄을 다 쓰고, 나머지는 셋씩
 * 묶는다. 설정에 '폭' 을 두지 않는 이유는, 칸을 만드는 사람이 화면 폭까지
 * 신경 쓰게 하고 싶지 않아서다.
 */
export default function CustomFieldInputs({ fields, values, onChange }: Props) {
  if (fields.length === 0) return null

  // textarea 는 자기 혼자 한 줄, 나머지는 3개씩 묶는다.
  const rows: CustomField[][] = []
  let cur: CustomField[] = []
  for (const f of fields) {
    if (f.type === 'textarea') {
      if (cur.length) {
        rows.push(cur)
        cur = []
      }
      rows.push([f])
      continue
    }
    cur.push(f)
    if (cur.length === 3) {
      rows.push(cur)
      cur = []
    }
  }
  if (cur.length) rows.push(cur)

  const render = (f: CustomField) => {
    const v = values[f.key]
    const label = (
      <span>
        {f.label}
        {f.required && <b className="req-mark"> *</b>}
      </span>
    )

    if (f.type === 'checkbox') {
      // 체크박스는 label 안에서 글자 옆에 붙는 편이 자연스럽다.
      return (
        <label className="fld cf-check" key={f.key} title={f.note ?? ''}>
          {label}
          <input
            type="checkbox"
            checked={!!v}
            onChange={(e) => onChange(f.key, e.target.checked)}
          />
        </label>
      )
    }

    if (f.type === 'textarea') {
      return (
        <div className="fld wide" key={f.key}>
          {label}
          <textarea
            rows={4}
            value={typeof v === 'string' ? v : ''}
            placeholder={f.note ?? ''}
            onChange={(e) => onChange(f.key, e.target.value)}
          />
        </div>
      )
    }

    if (f.type === 'select') {
      const opts = cfOptions(f)
      // 이미 저장된 값이 목록에서 빠지면 그 칸이 빈 것처럼 보인다.
      // 설정에서 값을 지웠어도 지금 들고 있는 값은 계속 고를 수 있게 남긴다.
      const curVal = typeof v === 'string' ? v : ''
      const extra = curVal && !opts.includes(curVal) ? [curVal] : []
      return (
        <label className="fld" key={f.key} title={f.note ?? ''}>
          {label}
          <select value={curVal} onChange={(e) => onChange(f.key, e.target.value)}>
            <option value="">(선택 안 함)</option>
            {[...opts, ...extra].map((o) => (
              <option key={o} value={o}>
                {o}
                {extra.includes(o) ? ' (목록에 없음)' : ''}
              </option>
            ))}
          </select>
        </label>
      )
    }

    return (
      <label className="fld" key={f.key} title={f.note ?? ''}>
        {label}
        <input
          type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
          value={v === undefined || v === null ? '' : String(v)}
          placeholder={f.note ?? ''}
          onChange={(e) => onChange(f.key, e.target.value)}
        />
      </label>
    )
  }

  return (
    <>
      {/* 기본 칸과 섞이면 어디까지가 우리 팀이 늘린 칸인지 알 수 없다.
          가로줄 하나로 나눠 둔다. */}
      <div className="cf-sep">
        <span>추가 항목</span>
      </div>
      {rows.map((row, i) =>
        row.length === 1 && row[0]!.type === 'textarea' ? (
          render(row[0]!)
        ) : (
          <div className="frow" key={i}>
            {row.map(render)}
          </div>
        ),
      )}
    </>
  )
}
