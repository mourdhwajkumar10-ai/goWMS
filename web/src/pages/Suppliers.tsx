import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import { ListPage, Column } from '../components/templates/ListPage'
import { useClientPager } from '../hooks/useClientPager'

interface Sup {
  id: number
  name: string
  supplier_group: string | null
  gstin: string | null
  disabled: boolean
  barcode?: string
}

export default function Suppliers() {
  const [list, setList] = useState<Sup[]>([])
  const [showNew, setShowNew] = useState(false)
  const [msg, setMsg] = useState('')

  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [gstin, setGstin] = useState('')
  const [isTransporter, setIsTransporter] = useState(false)
  const [carrierCode, setCarrierCode] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [barcode, setBarcode] = useState('')

  const loadList = () => api.supplierList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { loadList() }, [])

  const createSupplier = async () => {
    const r = await api.supplierCreate({
      name,
      supplier_group: group,
      gstin,
      is_transporter: isTransporter,
      carrier_code: carrierCode || undefined,
      contact_phone: phone || undefined,
      contact_email: email || undefined,
      barcode: barcode || undefined,
    })
    if (r.ok) {
      setMsg(`Supplier "${name}" created`)
      setName(''); setGroup(''); setGstin(''); setIsTransporter(false); setCarrierCode(''); setPhone(''); setEmail(''); setBarcode('')
      setShowNew(false)
      loadList()
      notify({ type: 'success', title: 'Supplier Created', message: name })
    } else {
      notify({ type: 'error', title: 'Failed', message: r.error || '' })
    }
  }

  const columns = [
    { key: 'name', header: 'Name', render: (s: any) => <span className="font-medium" style={{ color: 'var(--accent)' }}>{s.name}</span> },
    { key: 'supplier_group', header: 'Group', render: (s: any) => s.supplier_group || '—' },
    { key: 'gstin', header: 'GSTIN', render: (s: any) => s.gstin || '—' },
    { key: 'barcode', header: 'Barcode', render: (s: any) => s.barcode || '—' },
    { key: 'disabled', header: 'Status', render: (s: any) => (
      <span className={`erpnext-badge ${s.disabled ? 'erpnext-badge-red' : 'erpnext-badge-green'}`}>
        {s.disabled ? 'disabled' : 'active'}
      </span>
    )},
  ]

  return (
    <ListPage
      title="Suppliers"
      description="Supplier master with GST tracking"
      columns={columns}
      data={list}
      search={{ placeholder: 'Search suppliers…', onChange: () => {} }}
      actions={[{ label: showNew ? '✕ Cancel' : '+ New Supplier', onClick: () => setShowNew(!showNew), variant: 'default' }]}
      emptyState={{ icon: '🏭', title: 'No suppliers', message: 'Create your first supplier' }}
    />
  )
}