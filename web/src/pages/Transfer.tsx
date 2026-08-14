import { useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import './Transfer.css'

/**
 * 데이터 이사 — 묶음 단위 내보내기/가져오기.
 *
 * 랩마다 UTOP 이 따로 서 있어 자료를 옮기는 일이 잦다. DB 를 통째로
 * 복사하면 장비 비밀번호까지 따라가므로, 묶음을 골라 JSON 하나로 뜨고
 * 받는 쪽은 ID 기준 합치기(있으면 덮고 없으면 만들고, 지우지는 않음)로
 * 넣는다. 관리자만 쓸 수 있다.
 */

const PARTS = [
  { k: 'req', label: '요구사항', desc: '폴더 구조 + 요구사항 전부' },
  { k: 'tc', label: '시험항목', desc: '스텝·토폴로지 포함 전체, 요구사항 연결 유지' },
  { k: 'cycle', label: '사이클', desc: '구성과 실행 결과' },
  { k: 'defect', label: '결함', desc: 'DEF-… 전부' },
  { k: 'device', label: '장비', desc: '접속 방식·인터페이스 (비밀번호는 기본 제외)' },
  { k: 'catalog', label: '카탈로그·랙', desc: '장비 카탈로그 + 랙 틀·부품' },
  { k: 'settings', label: '설정', desc: '커스텀 필드·전역 파라미터·브랜딩 (LLM/Jira 키 제외)' },
] as const

interface ImportedFile {
  name: string
  data: {
    app?: string
    exported_at?: string
    parts?: Record<string, Record<string, unknown>>
  }
}

/** 묶음 안에 뭐가 몇 건인지 — 가져오기 전에 눈으로 확인하는 줄 */
function countOf(k: string, p: Record<string, unknown> | undefined): string {
  if (!p) return ''
  const n = (key: string) => (Array.isArray(p[key]) ? (p[key] as unknown[]).length : 0)
  switch (k) {
    case 'req': return `폴더 ${n('categories')} · 요구사항 ${n('reqs')}건`
    case 'tc': return `${n('tcs')}건`
    case 'cycle': return `${n('cycles')}건`
    case 'defect': return `${n('defects')}건`
    case 'device': return `${n('devices')}대${p.secrets ? ' · 비밀번호 포함!' : ''}`
    case 'catalog': {
      const racks = (p.racks as { racks?: unknown[] } | undefined)?.racks
      return `항목 ${n('items')} · 랙 ${Array.isArray(racks) ? racks.length : 0}`
    }
    case 'settings': return `커스텀 필드 ${n('custom_fields')}`
    default: return ''
  }
}

export default function Transfer({ mode }: { mode: 'export' | 'import' }) {
  const [exp, setExp] = useState<Set<string>>(() => new Set(PARTS.map((p) => p.k)))
  const [secrets, setSecrets] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ kind: string; text: string }>({ kind: '', text: '' })
  const [file, setFile] = useState<ImportedFile | null>(null)
  const [imp, setImp] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement | null>(null)

  const toggle = (set: Set<string>, k: string, fn: (v: Set<string>) => void) => {
    const n = new Set(set)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    fn(n)
  }

  const doExport = async () => {
    setBusy('exp')
    setMsg({ kind: '', text: '' })
    try {
      const q = `parts=${[...exp].join(',')}${secrets ? '&secrets=1' : ''}`
      const r = await apiFetch(`/api/transfer/export?${q}`)
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { detail?: string }
        throw new Error(b.detail || `내보내지 못했습니다 (${r.status})`)
      }
      const data = await r.json()
      const blob = new Blob([JSON.stringify(data, null, 1)], {
        type: 'application/json;charset=utf-8',
      })
      const a = document.createElement('a')
      const d = new Date()
      const p2 = (n: number) => String(n).padStart(2, '0')
      a.href = URL.createObjectURL(blob)
      a.download = `utop-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      setMsg({ kind: 'ok', text: '내려받았습니다 — 받은 쪽에서 「가져오기」 에 올리면 됩니다' })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy('')
    }
  }

  const pickFile = (f: File | undefined) => {
    if (!f) return
    setMsg({ kind: '', text: '' })
    const fr = new FileReader()
    fr.onload = () => {
      try {
        const data = JSON.parse(String(fr.result || '{}')) as ImportedFile['data']
        if (data.app !== 'utop' || !data.parts) throw new Error('UTOP 내보내기 파일이 아닙니다')
        setFile({ name: f.name, data })
        setImp(new Set(Object.keys(data.parts)))
      } catch (e) {
        setFile(null)
        setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
      }
    }
    fr.readAsText(f)
  }

  const doImport = async () => {
    if (!file) return
    const names = PARTS.filter((p) => imp.has(p.k)).map((p) => p.label).join(', ')
    if (
      !window.confirm(
        `${names} 를 합치기로 가져옵니다.\n같은 ID 는 파일 내용으로 덮고, 없는 것은 만듭니다. 지우지는 않습니다.`,
      )
    )
      return
    setBusy('imp')
    setMsg({ kind: '', text: '' })
    try {
      const parts: Record<string, unknown> = {}
      for (const k of imp) parts[k] = file.data.parts?.[k]
      const r = await apiFetch('/api/transfer/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parts }),
      })
      const b = (await r.json().catch(() => ({}))) as {
        ok?: boolean
        done?: Record<string, number>
        errors?: string[]
        error_count?: number
        detail?: string
      }
      if (!r.ok || !b.ok) throw new Error(b.detail || `가져오지 못했습니다 (${r.status})`)
      const summary = Object.entries(b.done ?? {})
        .map(([k, n]) => `${PARTS.find((p) => p.k === k)?.label ?? k} ${n}건`)
        .join(' · ')
      if (b.error_count) {
        setMsg({
          kind: 'err',
          text: `일부만 가져왔습니다 — ${summary} · 실패 ${b.error_count}건: ${(b.errors ?? []).slice(0, 3).join(' / ')}`,
        })
      } else {
        setMsg({ kind: 'ok', text: `가져왔습니다 — ${summary}` })
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="tr-page">
      {msg.text && <div className={`tr-msg ${msg.kind}`}>{msg.text}</div>}

      <div className="tr-cols">
        {mode === 'export' && (
        <div className="tr-card">
          <h3>내보내기</h3>
          <p className="muted small">체크한 묶음만 한 파일로 내려받습니다.</p>
          {PARTS.map((p) => (
            <label className="tr-part" key={p.k}>
              <input
                type="checkbox"
                checked={exp.has(p.k)}
                onChange={() => toggle(exp, p.k, setExp)}
              />
              <span className="tr-pl">
                <b>{p.label}</b>
                <i>{p.desc}</i>
              </span>
            </label>
          ))}
          <label className={`tr-secret${secrets ? ' on' : ''}`}>
            <input
              type="checkbox"
              checked={secrets}
              disabled={!exp.has('device')}
              onChange={(e) => setSecrets(e.target.checked)}
            />
            장비 비밀번호도 포함 — 파일을 받는 쪽을 믿을 수 있을 때만
          </label>
          <div className="tr-foot">
            <button
              className="btn primary"
              type="button"
              disabled={busy !== '' || exp.size === 0}
              onClick={() => void doExport()}
            >
              {busy === 'exp' ? '만드는 중…' : '내보내기 (.json)'}
            </button>
          </div>
        </div>
        )}

        {mode === 'import' && (
        <div className="tr-card">
          <h3>가져오기</h3>
          <p className="muted small">
            내보낸 파일을 올리면 안에 뭐가 있는지 먼저 보여줍니다. 합치기 방식 —
            같은 ID 는 덮고, 없는 것은 만들고, <b>지우지는 않습니다</b>.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              pickFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <button className="btn" type="button" onClick={() => fileRef.current?.click()}>
            파일 고르기…
          </button>

          {file && (
            <>
              <div className="tr-fileinfo">
                <b>{file.name}</b>
                {file.data.exported_at && (
                  <span className="muted small">내보낸 때 {file.data.exported_at}</span>
                )}
              </div>
              {PARTS.filter((p) => file.data.parts?.[p.k]).map((p) => (
                <label className="tr-part" key={p.k}>
                  <input
                    type="checkbox"
                    checked={imp.has(p.k)}
                    onChange={() => toggle(imp, p.k, setImp)}
                  />
                  <span className="tr-pl">
                    <b>{p.label}</b>
                    <i>{countOf(p.k, file.data.parts?.[p.k])}</i>
                  </span>
                </label>
              ))}
              <div className="tr-foot">
                <button
                  className="btn primary"
                  type="button"
                  disabled={busy !== '' || imp.size === 0}
                  onClick={() => void doImport()}
                >
                  {busy === 'imp' ? '넣는 중…' : '가져오기 (합치기)'}
                </button>
              </div>
            </>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
