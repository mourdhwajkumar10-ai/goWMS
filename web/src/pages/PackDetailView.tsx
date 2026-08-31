import { StatusBadge } from '../components/common/StatusBadge'
import Comments from '../components/Comments'

interface DetailViewProps {
  selectedBox: any
  packItem: string
  packQty: string
  packBatch: string
  setPackItem: (value: string) => void
  setPackQty: (value: string) => void
  setPackBatch: (value: string) => void
  setShowScanner: (value: boolean) => void
  packIntoBox: () => void
  markLoaded: (id: number) => void
  setSelectedBox: (value: any) => void
  api: any
  notify: any
}

export function DetailView({
  selectedBox,
  packItem,
  packQty,
  packBatch,
  setPackItem,
  setPackQty,
  setPackBatch,
  setShowScanner,
  packIntoBox,
  markLoaded,
  setSelectedBox,
  api,
  notify,
}: DetailViewProps) {
  if (!selectedBox) return null

  const handlePrintLabel = async () => {
    const r = await api.packLabel(selectedBox.id)
    if (r.ok && r.data?.html) {
      const w = window.open('', '_blank')
      if (w) { w.document.write(r.data.html); w.document.close(); w.print() }
    } else notify({ type: 'error', title: 'Label failed', message: r.error || '' })
  }

  return (
    <div className="erpnext-card">
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h3 className="font-semibold">{selectedBox.label}</h3>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Pick List: {selectedBox.pick_list_id || '\u2014'} | Delivery Note: {selectedBox.delivery_note || '\u2014'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="erpnext-btn-secondary" onClick={handlePrintLabel}>Print Label</button>
          <button onClick={() => setSelectedBox(null)} className="erpnext-btn-secondary">Back</button>
        </div>
      </div>

      <div className="p-4">
        <h4 className="font-medium text-sm mb-2">Pack Item</h4>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="erpnext-label">Item Code</label>
            <div className="flex gap-1">
              <input
                className="erpnext-input"
                value={packItem}
                onChange={e => setPackItem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); packIntoBox() } }}
                placeholder="ITEM-001"
              />
              <button onClick={() => setShowScanner(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>📷</button>
            </div>
          </div>
          <div>
            <label className="erpnext-label">Quantity</label>
            <input
              className="erpnext-input"
              type="number"
              value={packQty}
              onChange={e => setPackQty(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); packIntoBox() } }}
            />
          </div>
          <div>
            <label className="erpnext-label">Batch No</label>
            <input
              className="erpnext-input"
              value={packBatch}
              onChange={e => setPackBatch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); packIntoBox() } }}
            />
          </div>
          <div className="flex items-end">
            <button onClick={packIntoBox} className="erpnext-btn-primary">Pack</button>
          </div>
        </div>

        {selectedBox.items && selectedBox.items.length > 0 && (
          <div className="mt-4">
            <h4 className="font-medium text-sm mb-2">Packed Items ({selectedBox.items.length})</h4>
            <div className="table-wrap">
              <table className="erpnext-table text-sm">
                <thead>
                  <tr><th>Item</th><th>Quantity</th><th>Batch</th></tr>
                </thead>
                <tbody>
                  {selectedBox.items.map((bi: any) => (
                    <tr key={bi.id}>
                      <td className="font-medium">{bi.item_code}</td>
                      <td>{bi.quantity}</td>
                      <td>{bi.batch_no || '\u2014'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!selectedBox.loaded && (
          <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
            <button type="button" className="erpnext-btn-outline" onClick={() => void markLoaded(selectedBox.id)}>
              Mark loaded
            </button>
          </div>
        )}

        <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
          <Comments entityType="box" entityId={selectedBox.id} />
        </div>
      </div>
    </div>
  )
}