import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import { ListPage, Column } from '../components/templates/ListPage'
import { StatusBadge } from '../components/common/StatusBadge'


interface Cust {
  id: number
  name: string
  customer_group: string | null
  customer_type: string | null
  gstin: string | null
  territory: string | null
}

export default function Customers() {
  const [list, setList] = useState<Cust[]>([])
  const [showNew, setShowNew] = useState(false)

  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [gstin, setGstin] = useState('')
  const [territory, setTerritory] = useState('')

  const loadList = () => api.customerList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { loadList() }, [])

  const createCustomer = async () => {
    const r = await api.customerCreate({ name, customer_group: group, gstin, territory })
    if (r.ok) {
      setName(''); setGroup(''); setGstin(''); setTerritory('')
      setShowNew(false)
      loadList()
      notify({ type: 'success', title: 'Customer Created', message: name })
    } else {
      notify({ type: 'error', title: 'Create failed', message: r.error || '' })
    }
  }

  const columns: Column<Cust>[] = [
    { key: 'name', header: 'Name', render: (c: Cust) => <span className="font-medium" style={{ color: 'var(--accent)' }}>{c.name}</span> },
    { key: 'customer_group', header: 'Group', render: (c: Cust) => c.customer_group || '—' },
    { key: 'customer_type', header: 'Type', render: (c: Cust) => c.customer_type || '—' },
    { key: 'gstin', header: 'GSTIN', render: (c: Cust) => c.gstin || '—' },
    { key: 'territory', header: 'Territory', render: (c: Cust) => c.territory || '—' },
  ]

  return (
    <ListPage<Cust>
      title="Customers"
      description="Customer master with GST and territory tracking"
      columns={columns}
      data={list}
      search={{ placeholder: 'Search customers…' }}
      actions={[{ label: showNew ? '✕ Cancel' : '+ New Customer', onClick: () => setShowNew(!showNew), variant: 'default' as const }]}
      emptyState={{ icon: '👥', title: 'No customers', message: 'Create your first customer' }}
    />
  )
}