import type { ReactNode } from 'react'
import './InfoPane.css'

/**
 * **INFO 칸 한 벌** — 요구사항·시험항목 두 화면이 **같은 부품**을 쓴다.
 *
 * 두 화면에 따로 그려 두면 한쪽만 고쳐져 같은 칸이 서로 다른 말을 한다.
 * 묶음과 차례는 정의(지시) 그대로다.
 *
 *   기본정보  — 프로젝트 · 분류 / 요구사항 ID · 제목 / 시험항목 ID · 제목
 *   적용 모델 — 모델그룹 · 모델명
 *   필드 정보 — 상태 · 실행타입 · 심각도 · 유형 · 발생구분
 *   추가 필드 — 유동적(커스텀 필드)
 *   기록      — 생성자 · 생성일 · 변경자 · 변경일
 *
 * **맞물린 칸의 규칙**(지시). 요구사항 1 : 시험항목 N 이라 두 화면의 뜻이
 * 갈린다.
 *  · 시험항목 화면 — 요구사항 **ID 는 못 고치고 눌러서 이동**, **제목
 *    드롭다운은 「어느 요구사항에 매달지」를 바꾼다**(저장된다).
 *  · 요구사항 화면 — 시험항목 **ID 는 못 고치고 눌러서 이동**, **제목
 *    드롭다운은 달린 시험항목 중 하나를 고르는 것**(보기·이동용).
 */

export interface InfoLink {
  /** 눌러서 갈 곳. 비면 못 누른다 */
  id: string
  /** 사람이 읽는 ID. 없으면 id 를 그대로 보여 준다 — 요구사항은 속으로
      날 PK(req-178…)를 쓰는데 사람에게는 E61xx_R0007 로 보여야 한다 */
  label?: string
  /** 드롭다운에 설 것들 */
  options: Array<{ id: string; title: string }>
  /** 드롭다운에서 골랐을 때 */
  onPick: (id: string) => void
  /** ID 를 눌렀을 때 */
  onGo?: (id: string) => void
  /** 드롭다운 밑에 붙일 한 줄 안내 */
  hint?: string
  /** **제 것**일 때 — 그 화면이 들고 있는 기록의 제목이라 드롭다운이 아니라
      글자칸이다(시험항목 화면의 시험항목 제목, 요구사항 화면의 요구사항 제목) */
  onTitle?: (v: string) => void
}

export interface InfoField {
  key: string
  label: string
  value: string
  options?: string[]
  onChange?: (v: string) => void
}

export default function InfoPane({
  project, category, req, tc, modelGroup, model, fields, custom, record, extra,
}: {
  project?: string
  category?: string
  /** 요구사항 쪽 — 이 화면이 요구사항이면 제 것, 시험항목이면 매달린 것 */
  req: InfoLink & { title: string }
  /** 시험항목 쪽 — 요구사항 화면에서는 여럿 중 고른 하나 */
  tc: InfoLink & { title: string }
  modelGroup?: { value: string; options: string[]; onChange?: (v: string) => void }
  model?: { value: string; options: string[]; onChange?: (v: string) => void }
  /** 필드 정보 — 상태·실행타입·심각도·유형·발생구분 */
  fields: InfoField[]
  /** 추가 필드 — 유동적 */
  custom?: InfoField[]
  record?: { by?: string; at?: string; upBy?: string; upAt?: string }
  /** 화면이 더 끼우고 싶은 것 */
  extra?: ReactNode
}) {
  const day = (v?: string) => String(v ?? '').replace('T', ' ').slice(0, 16) || '–'

  /** ID 칸 — 못 고친다. 값이 있으면 눌러서 그리로 간다 */
  const idCell = (label: string, l: InfoLink) => (
    <label className="ip-f">
      <span>{label}</span>
      {l.id ? (
        <button
          type="button"
          className="ip-id"
          title={l.onGo ? `${l.id} 로 이동합니다` : l.id}
          disabled={!l.onGo}
          onClick={() => l.onGo?.(l.id)}
        >
          {l.label || l.id}
        </button>
      ) : (
        <span className="ip-id none">–</span>
      )}
    </label>
  )

  /** 제목 칸 — 드롭다운. 무엇을 뜻하는지는 화면마다 다르다(hint 로 적는다) */
  const titleCell = (label: string, l: InfoLink & { title: string }) => (
    <label className="ip-f">
      <span>{label}</span>
      {l.onTitle ? (
        /* 이 화면이 들고 있는 기록의 제목 — 그대로 고친다 */
        <input value={l.title} onChange={(e) => l.onTitle?.(e.target.value)} />
      ) : (
      <select
        value={l.id}
        onChange={(e) => l.onPick(e.target.value)}
        disabled={!l.options.length}
      >
        {!l.options.some((o) => o.id === l.id) && (
          <option value={l.id}>{l.title || '(고르세요)'}</option>
        )}
        {l.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title || o.id}
          </option>
        ))}
      </select>
      )}
      {l.hint && <em className="ip-hint">{l.hint}</em>}
    </label>
  )

  /** 모델 칸 — 고르는 목록이 비어도 **값은 보여야 한다.**
      요구사항 화면은 제 모델이 없어 프로젝트 값을 비추는데, 목록이 비면
      그 값을 담을 option 이 없어 빈 칸으로 보였다(지적: 아무 내용이 없어). */
  const modelCell = (
    label: string,
    m?: { value: string; options: string[]; onChange?: (v: string) => void },
  ) => (
    <label className="ip-f">
      <span>{label}</span>
      <select
        value={m?.value ?? ''}
        onChange={(e) => m?.onChange?.(e.target.value)}
        disabled={!m?.onChange}
        title={m?.onChange ? undefined : '프로젝트에서 온 값입니다'}
      >
        <option value="">(공용)</option>
        {(m?.options ?? []).map((o) => (
          <option key={o}>{o}</option>
        ))}
        {m?.value && !(m.options ?? []).includes(m.value) && (
          <option value={m.value}>{m.value}</option>
        )}
      </select>
    </label>
  )

  const pick = (f: InfoField) => (
    <label className="ip-f" key={f.key}>
      <span>{f.label}</span>
      {f.options ? (
        <select
          value={f.value}
          onChange={(e) => f.onChange?.(e.target.value)}
          disabled={!f.onChange}
        >
          <option value="">(선택)</option>
          {f.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
          {/* 설정에서 지운 값이 이미 저장돼 있을 수 있다. 자리를 만들지
              않으면 다른 칸을 고치는 순간 조용히 빈 값이 된다. */}
          {f.value && !f.options.includes(f.value) && (
            <option value={f.value}>{f.value} (없는 값)</option>
          )}
        </select>
      ) : (
        <input
          value={f.value}
          onChange={(e) => f.onChange?.(e.target.value)}
          readOnly={!f.onChange}
        />
      )}
    </label>
  )

  return (
    <div className="ip">
      <section className="ip-card">
        <div className="ip-h">기본정보</div>
        <div className="ip-grid pairs">
          <label className="ip-f">
            <span>프로젝트</span>
            <input value={project ?? ''} readOnly />
          </label>
          <label className="ip-f">
            <span>분류</span>
            <input value={category ?? ''} readOnly title={category} />
          </label>
          {idCell('요구사항 ID', req)}
          {titleCell('요구사항 제목', req)}
          {idCell('시험항목 ID', tc)}
          {titleCell('시험항목 제목', tc)}
        </div>
      </section>

      <section className="ip-card">
        <div className="ip-h">
          적용 모델 <em>비우면 공용 — 플랜 만들기가 이 기준으로 항목을 거릅니다</em>
        </div>
        <div className="ip-grid">
          {modelCell('모델그룹', modelGroup)}
          {modelCell('모델명', model)}
        </div>
      </section>

      <section className="ip-card">
        <div className="ip-h">
          필드 정보 <em>고를 값·색은 표 머리의 「속성 편집」에서 정합니다</em>
        </div>
        <div className="ip-grid">{fields.map(pick)}</div>
      </section>

      {!!custom?.length && (
        <section className="ip-card">
          <div className="ip-h">
            추가 필드 <em>표에서 만든 칸입니다</em>
          </div>
          <div className="ip-grid">{custom.map(pick)}</div>
        </section>
      )}

      {extra}

      {record && (
        <section className="ip-card">
          <div className="ip-h">
            기록 <em>저장할 때 서버가 남깁니다</em>
          </div>
          <div className="ip-grid rec">
            <div className="ip-r">
              <span>생성자</span>
              <b>{record.by || '–'}</b>
            </div>
            <div className="ip-r">
              <span>생성일</span>
              <b>{day(record.at)}</b>
            </div>
            <div className="ip-r">
              <span>변경자</span>
              <b>{record.upBy || '–'}</b>
            </div>
            <div className="ip-r">
              <span>변경일</span>
              <b>{day(record.upAt)}</b>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
