'use client'

import { useState } from 'react'
import {
  AlertTriangle, Archive, ArrowDownToLine, ArrowLeftRight, BarChart3, Bell, Box, CheckSquare, ChevronDown, ClipboardList, FileText, HeartPulse, Home, Menu, PackageCheck, PackageOpen, PanelLeft, Plus, RefreshCw,   Search, SlidersHorizontal, Square, Truck, X,
} from 'lucide-react'

const navGroups = [
  { label: 'Home', items: [{ label: 'Dashboard', icon: Home }, { label: 'Analytics', icon: BarChart3 }] },
  { label: 'Inward', items: [{ label: 'Receiving', icon: PackageOpen }, { label: 'RF Scanner', icon: Box }, { label: 'Exceptions', icon: AlertTriangle }, { label: 'Follow-Up Receipts', icon: RefreshCw }, { label: 'Random Audit', icon: Plus }, { label: 'Putaway', icon: ArrowDownToLine }, { label: 'Putaway Logs', icon: FileText }] },
  { label: 'Stock', items: [{ label: 'Picking', icon: CheckSquare }, { label: 'Packing', icon: Square }, { label: 'Dispatch', icon: Truck }, { label: 'Cycle Count', icon: RefreshCw }, { label: 'Stock Scan', icon: SlidersHorizontal }, { label: 'Inventory Health', icon: HeartPulse }, { label: 'Transfers', icon: ArrowLeftRight }, { label: 'Stock Entry', icon: ClipboardList }, { label: 'Stock Reconciliation', icon: Archive }, { label: 'Serial No', icon: FileText }, { label: 'Batch', icon: X }, { label: 'Quality Inspection', icon: Plus }] },
  { label: 'Buying', items: [{ label: 'Purchase Order', icon: ClipboardList }, { label: 'Purchase Invoice', icon: FileText }, { label: 'Supplier', icon: PackageCheck }] },
]

const metrics = [
  ['21,096', 'Items in Catalog', 'text-foreground'], ['0', 'Units Available', 'text-primary'], ['0', 'Receipts Awaiting Review', 'text-warning'],
  ['1', 'Pick Lists in Progress', 'text-accent'], ['0', 'Orders Awaiting Stock', 'text-destructive'], ['0', 'Counts Due Today', 'text-warning'],
]
const shortcuts = [['Receive (GRN)', 'Goods receipt against PO', PackageOpen], ['Purchase Order', 'Create / submit buying docs', ClipboardList], ['Pick List', 'Pick against sales orders', CheckSquare], ['Packing', 'Pack picked items', PackageCheck], ['Dispatch', 'Load and ship trips', Truck], ['Item', 'Item master', Box]] as const

export default function WarehouseDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [active, setActive] = useState('Dashboard')
  const [search, setSearch] = useState('')
  const filteredGroups = navGroups.map((group) => ({ ...group, items: group.items.filter((item) => item.label.toLowerCase().includes(search.toLowerCase())) })).filter((group) => group.items.length)

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {sidebarOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-foreground/20 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-border bg-card transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-24 items-center gap-3 border-b border-border px-6">
          <div className="grid size-12 place-items-center rounded-lg bg-primary text-xl font-semibold text-primary-foreground">gW</div>
          <div><p className="text-xl font-semibold tracking-tight">goWMS</p><p className="text-sm text-muted-foreground">Warehouse Desk</p></div>
        </div>
        <nav className="h-[calc(100dvh-6rem)] overflow-y-auto px-3 py-5">
          {filteredGroups.map((group) => <div key={group.label} className="mb-6"><p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{group.label}</p><div className="grid gap-1">{group.items.map(({ label, icon: Icon }) => <button key={label} onClick={() => { setActive(label); setSidebarOpen(false) }} className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 text-left text-sm transition-all duration-200 ${active === label ? 'border-primary/15 bg-primary/10 font-semibold text-primary' : 'border-transparent text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground'}`}><Icon className="size-4" strokeWidth={1.8} />{label}</button>)}</div></div>)}
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-24 items-center gap-4 border-b border-border bg-card/95 px-5 backdrop-blur-sm lg:px-8">
          <button aria-label="Open navigation" className="grid size-11 shrink-0 place-items-center rounded-lg border border-border bg-secondary lg:hidden" onClick={() => setSidebarOpen(true)}><Menu className="size-5" /></button>
          <div className="relative w-full max-w-xl"><Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pages..." className="h-12 w-full rounded-lg border border-border bg-background pl-11 pr-16 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" /><kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border px-2 py-1 text-xs text-muted-foreground">⌘K</kbd></div>
          <div className="ml-auto flex items-center gap-3"><button aria-label="Notifications" className="grid size-11 place-items-center rounded-lg border border-border bg-secondary"><Bell className="size-5" /></button><button className="flex items-center gap-3 rounded-lg border border-border bg-secondary px-3 py-2 text-left"><span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-medium text-primary-foreground">A</span><span className="hidden sm:block"><span className="block text-sm font-medium">admin</span><span className="block text-xs text-muted-foreground">Admin</span></span><ChevronDown className="hidden size-4 text-muted-foreground sm:block" /></button></div>
        </header>
        <main className="mx-auto max-w-[1440px] px-5 py-8 lg:px-10 lg:py-10"><div className="mb-9 border-b border-border/70 pb-8"><p className="mb-3 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Overview</p><h1 className="text-4xl font-semibold tracking-tight">{active === 'Dashboard' ? 'Home' : active}</h1><p className="mt-2 text-base text-muted-foreground">Warehouse operations overview</p></div>
          <section className="mb-12"><h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">Number cards</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([value, label, color]) => <article key={label} className="group rounded-xl border border-border/80 bg-card px-6 py-6 shadow-[0_1px_2px_oklch(0.17_0.018_258/0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"><p className={`text-4xl font-semibold tracking-tight ${color}`}>{value}</p><p className="mt-4 text-base text-muted-foreground">{label}</p></article>)}</div></section>
          <section><h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">Shortcuts</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{shortcuts.map(([title, description, Icon]) => <button key={title} className="group flex min-h-32 items-start gap-4 rounded-xl border border-border bg-card p-6 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><Icon className="size-5" strokeWidth={1.8} /></span><span><span className="block text-lg font-medium">{title}</span><span className="mt-2 block text-sm leading-6 text-muted-foreground">{description}</span></span></button>)}</div></section>
        </main>
      </div>
    </div>
  )
}
