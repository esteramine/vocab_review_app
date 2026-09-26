import { useRef, useState } from 'react'
import {
  parseBulk,
  insertRows,
  downloadBackup,
  readBackupFile,
  importBackup,
  type ImportMode
} from '../lib/io'

const SAMPLE_PASTE = `# 一行一個單字，用 Tab 或逗號分隔：單字 / 讀音 / 意思 / 例句(可空) / 例句翻譯(可空) / 詞性(可空)
# 例句中用 { } 框住要挖空的部分（尤其動詞變化形）
安い\tやすい\t便宜的\tこの店はとても{安い}です。\t這家店很便宜。\tい形容詞
食べる\tたべる\t吃\t毎朝パンを{食べます}。\t每天早上吃麵包。\t他動詞`

export function ManageScreen() {
  const [bulk, setBulk] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const preview = bulk.trim() ? parseBulk(bulk) : null

  const doImportBulk = async () => {
    setErr(null)
    setMsg(null)
    const { rows, errors } = parseBulk(bulk)
    if (rows.length === 0) {
      setErr('沒有可匯入的資料')
      return
    }
    const n = await insertRows(rows)
    setBulk('')
    let text = `已匯入 ${n} 個單字`
    if (errors.length) text += `（${errors.length} 行有誤，已略過）`
    setMsg(text)
  }

  const doExport = async () => {
    setErr(null)
    await downloadBackup()
    setMsg('已匯出 JSON 備份檔')
  }

  const doImportFile = async (mode: ImportMode, file: File) => {
    setErr(null)
    setMsg(null)
    try {
      const data = await readBackupFile(file)
      const res = await importBackup(data, mode)
      setMsg(`已${mode === 'replace' ? '取代' : '合併'}匯入：單字 ${res.words}、卡片 ${res.cards}、紀錄 ${res.logs}`)
    } catch (e) {
      setErr(`匯入失敗：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <h2>資料管理</h2>
      </header>

      {msg && <p className="banner ok">{msg}</p>}
      {err && <p className="banner bad">{err}</p>}

      {/* Bulk paste */}
      <section className="block">
        <h3>批次貼上新增</h3>
        <p className="hint muted">
          一行一個單字，用 <code>Tab</code> 或逗號分隔：單字 / 讀音 / 意思 / 例句 / 例句翻譯 / 詞性。
          可在電腦用試算表或記事本準備好再貼上。
        </p>
        <textarea
          className="bulk jp"
          rows={8}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          placeholder={SAMPLE_PASTE}
        />
        {preview && (
          <p className="hint muted">
            預覽：可匯入 <b>{preview.rows.length}</b> 個
            {preview.errors.length > 0 && <>，<span className="warn">{preview.errors.length} 行有誤</span></>}
          </p>
        )}
        {preview && preview.errors.length > 0 && (
          <ul className="errlist">
            {preview.errors.slice(0, 5).map((e) => (
              <li key={e.line}>
                第 {e.line} 行：{e.reason}
              </li>
            ))}
          </ul>
        )}
        <button className="primary wide" disabled={!preview || preview.rows.length === 0} onClick={doImportBulk}>
          匯入 {preview?.rows.length ? `（${preview.rows.length}）` : ''}
        </button>
      </section>

      {/* Backup / restore */}
      <section className="block">
        <h3>匯出 / 匯入備份（電腦 ↔ 手機）</h3>
        <p className="hint muted">
          在電腦匯出 JSON，傳到手機（AirDrop／email／雲端），再於手機匯入即可同步。也可當備份。
        </p>
        <button className="secondary wide" onClick={doExport}>
          ⬇ 匯出 JSON 備份
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) doImportFile((e.target.dataset.mode as ImportMode) || 'merge', f)
            e.target.value = ''
          }}
        />
        <div className="row">
          <button
            className="secondary"
            onClick={() => {
              if (fileRef.current) {
                fileRef.current.dataset.mode = 'merge'
                fileRef.current.click()
              }
            }}
          >
            合併匯入
          </button>
          <button
            className="secondary"
            onClick={() => {
              if (!confirm('取代匯入會先清除目前所有單字，確定嗎？')) return
              if (fileRef.current) {
                fileRef.current.dataset.mode = 'replace'
                fileRef.current.click()
              }
            }}
          >
            取代匯入
          </button>
        </div>
        <p className="hint muted">合併：加到現有單字之後。取代：先清空再匯入。</p>
      </section>
    </div>
  )
}
