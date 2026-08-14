import { useRef } from 'react'
import { notify } from './Notifications'

interface Props {
  onImport: (rows: any[]) => void | Promise<void>
  disabled?: boolean
}

export default function CSVImport({ onImport, disabled }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (ev) => {
      const text = ev.target?.result as string
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length < 2) {
        notify({ type: 'warning', title: 'Empty CSV', message: 'No data rows found' })
        return
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
      const rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
        const row: any = {}
        headers.forEach((h, i) => { row[h] = values[i] || '' })
        return row
      })

      notify({ type: 'info', title: 'CSV parsed', message: `${rows.length} rows — importing in batches` })
      await onImport(rows)
    }
    reader.readAsText(file)

    // Reset input so same file can be re-imported
    e.target.value = ''
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="erpnext-btn-secondary text-sm"
        style={{ fontSize: 12 }}
        disabled={disabled}
      >
        {disabled ? 'Importing…' : '📄 Import CSV'}
      </button>
    </>
  )
}
