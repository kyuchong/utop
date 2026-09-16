import { useMailBook } from '@/lib/mailPeople'
import type { MailSeed } from './CycleMailDialog'
import './MailViewDialog.css'

/**
 * 보낸 메일 한 통을 펴 본다.
 *
 * 이력 표는 「누구에게 · 언제 · 무슨 제목」 까지만 말한다. 정작 알고 싶은
 * 「무엇을 적어 보냈나」 는 표에 담을 수 없어, 결국 받는 사람에게 되물었다.
 * 줄을 누르면 그때 나간 본문 그대로를 보여 준다.
 *
 * **다시 쓰기**는 받는 사람·참조·제목·본문을 그대로 채운 새 메일을 연다 —
 * 같은 사람들에게 한 번 더 보내는 일이 잦고, 그때마다 조직도를 다시 뒤지는
 * 것은 일이 아니다. 첨부는 이름만 남아 있어 다시 붙여야 한다.
 */
export interface MailViewRow {
  id: number
  at?: string | null
  who?: string | null
  to_list?: string | null
  cc_list?: string | null
  bcc_list?: string | null
  subject?: string | null
  note?: string | null
  ok?: boolean
  error?: string | null
  body_html?: string | null
  att?: Array<{ name?: string; size?: number }> | null
}

const split = (v?: string | null) =>
  String(v ?? '')
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean)

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}
function fmtWhen(v?: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function MailViewDialog({
  row,
  onClose,
  onResend,
}: {
  row: MailViewRow
  onClose: () => void
  onResend?: (seed: MailSeed) => void
}) {
  const book = useMailBook(true)
  const to = split(row.to_list)
  const cc = split(row.cc_list)
  const bcc = split(row.bcc_list)
  const att = row.att ?? []

  /** 주소를 사람 이름으로 — 모르는 주소는 그대로 */
  const chips = (list: string[], cls: string) =>
    list.map((m) => {
      const p = book.byMail[m]
      return (
        <span className={`mvw-chip ${cls}`} key={m} title={p ? `${p.path}\n${m}` : m}>
          {p ? (
            <>
              {p.name}
              {!!p.rank && <small>{p.rank}</small>}
              <span className="mvw-addr">{m}</span>
            </>
          ) : (
            m
          )}
        </span>
      )
    })
  const line = (k: string, v: React.ReactNode) => (
    <>
      <div className="mvw-k">{k}</div>
      <div className="mvw-v">{v}</div>
    </>
  )

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal mvw" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>보낸 메일</b>
          <span className="muted small">{fmtWhen(row.at)}</span>
          <span className="sp" />
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="modal-body mvw-body">
          <h3 className="mvw-subj">{row.subject || '(제목 없음)'}</h3>
          <div className="mvw-meta">
            {line('보낸 사람', row.who || '—')}
            {line('받는 사람', to.length ? chips(to, 'to') : '—')}
            {!!cc.length && line('참조', chips(cc, 'cc'))}
            {!!bcc.length && line('숨은 참조', chips(bcc, 'bcc'))}
            {!!att.length &&
              line(
                '첨부',
                att.map((f, i) => (
                  <span className="mvw-att" key={i} title={String(f.name ?? '')}>
                    📎 {f.name}
                    <small>{fmtSize(Number(f.size ?? 0))}</small>
                  </span>
                )),
              )}
            {line(
              '결과',
              row.ok ? (
                <span className="mvw-ok">보냄</span>
              ) : (
                <span className="mvw-ng">실패 — {row.error || '까닭이 남아 있지 않습니다'}</span>
              ),
            )}
            {!!row.note && line('한마디', row.note)}
          </div>

          {/* 그때 나간 본문 그대로. 남이 쓴 글일 수 있으니 **틀 안에** 가둔다 —
              바깥 화면의 서식을 건드리지도, 스크립트를 돌리지도 못한다. */}
          {row.body_html ? (
            <iframe
              className="mvw-doc"
              title="보낸 본문"
              sandbox=""
              srcDoc={`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:12px 14px;font:13px/1.7 'Pretendard','Malgun Gothic',sans-serif;color:#131920}table{border-collapse:collapse;margin:4px 0 10px;font-size:12px}th,td{border:1px solid #e7e5e4;padding:5px 12px;text-align:left}th{background:#f5f7f9}h1,h2,h3{margin:14px 0 6px;font-size:14px}p{margin:0 0 7px}</style>${row.body_html}`}
            />
          ) : (
            <div className="mvw-none">
              본문이 남아 있지 않습니다 — 이 기능을 넣기 전에 보낸 메일입니다.
            </div>
          )}
        </div>

        <div className="modal-foot">
          <span className="sp" />
          {!!onResend && (
            <button
              className="btn"
              type="button"
              title="받는 사람·제목·본문을 그대로 채운 새 메일을 엽니다 (첨부는 다시 붙여야 합니다)"
              onClick={() =>
                onResend({
                  to,
                  cc,
                  bcc,
                  subject: String(row.subject ?? ''),
                  body: String(row.body_html ?? ''),
                })
              }
            >
              이 메일로 다시 쓰기
            </button>
          )}
          <button className="btn cpl-teal" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
