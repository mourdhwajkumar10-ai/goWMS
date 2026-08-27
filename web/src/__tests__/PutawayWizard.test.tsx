import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { api } from '../services/api'
import PutawayWizard from '../pages/PutawayWizard'

vi.mock('../services/api', () => ({
  api: {
    putawayQueue: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    del: vi.fn(),
    putawaySuggest: vi.fn(),
  },
}))

vi.mock('../components/Notifications', () => ({
  notify: vi.fn(),
}))

vi.mock('../components/ScannerInput', () => ({
  default: ({ onScan, placeholder }: any) => (
    <input
      data-testid="scanner-input"
      placeholder={placeholder}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onScan(e.target.value)}
    />
  ),
}))

vi.mock('../components/ButtonPress', () => ({
  default: ({ children, onClick, className, disabled }: any) => (
    <button onClick={onClick} className={className} disabled={disabled}>
      {children}
    </button>
  ),
}))

vi.mock('../components/CameraScanner', () => ({
  default: () => null,
}))

vi.mock('../hooks/useHaptic', () => ({
  useHaptic: () => vi.fn(),
}))

vi.mock('../hooks/useRfUi', () => ({
  useRfUi: () => false,
}))

vi.mock('../hooks/useScanFeedback', () => ({
  useScanFeedback: () => ({ ok: vi.fn(), warn: vi.fn(), err: vi.fn() }),
}))

vi.mock('../components/ScannerLayout', () => ({
  default: ({ children, title, flash, onBack, noBack }: any) => (
    <div data-testid="scanner-layout">
      {title && <h1>{title}</h1>}
      {onBack && !noBack && <button data-testid="back-btn" onClick={onBack}>Back</button>}
      {flash && <div data-testid={`flash-${flash}`} />}
      {children}
    </div>
  ),
  useScannerToasts: () => ({ toasts: [], toast: vi.fn() }),
  ScannerToastBar: ({ toasts }: any) => <div data-testid="toast-bar">{toasts.map((t: any, i: number) => <div key={i}>{t.text}</div>)}</div>
}))

vi.mock('../components/scan/VerificationHeader', () => ({
  default: ({ counted, total, onBack, title, pl }: any) => (
    <header data-testid="verification-header">
      <span data-testid="counted">{counted}</span>
      <span data-testid="total">{total}</span>
      <button data-testid="vh-back" onClick={onBack}>Back</button>
      <span data-testid="vh-title">{title}</span>
      {pl && <span data-testid="vh-pl">{pl}</span>}
    </header>
  ),
}))

vi.mock('../components/scan/ScanCard', () => ({
  default: ({ onManualEntry, onRestart, placeholder, state, code, reason, viewport }: any) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        onManualEntry(e.currentTarget.value)
      }
    }
    return (
      <div data-testid="scan-card">
        <input
          data-testid="scan-input"
          placeholder={placeholder}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onManualEntry(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button data-testid="restart-btn" onClick={onRestart}>Restart</button>
        {viewport && <div data-testid="viewport">{viewport}</div>}
        {state !== 'idle' && <div data-testid={`verdict-${state}`}>{reason || code}</div>}
      </div>
    )
  },
}))

const mockApi = vi.mocked(api)

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.putawayQueue.mockResolvedValue({ ok: true, data: [] })
  mockApi.get.mockResolvedValue({ ok: true, data: [] })
  mockApi.putawaySuggest.mockResolvedValue({ ok: true, data: null })
  mockApi.post.mockResolvedValue({ ok: true, data: {} })
})

const queuedItem = {
  id: 1, item_code: 'ITEM-1', item_name: 'Test', warehouse_id: 1,
  warehouse_code: 'WH1', location_id: 1, location_code: 'LOC1',
  batch_no: 'B1', qty: 10, location_type: 'bin', zone: 'A',
  suggested_location_code: 'BIN-1',
}

describe('PutawayWizard', () => {
  it('renders mode select screen with two mode cards in ScannerLayout', () => {
    render(<PutawayWizard />)
    expect(screen.getByText('Putaway')).toBeInTheDocument()
    expect(screen.getByText('By Zone')).toBeInTheDocument()
    expect(screen.getByText('By Item')).toBeInTheDocument()
  })

  it('displays queue count on mode cards', async () => {
    mockApi.putawayQueue.mockResolvedValue({ ok: true, data: [queuedItem] })
    render(<PutawayWizard />)
    await waitFor(() => {
      expect(screen.getByText('1 pending')).toBeInTheDocument()
      expect(screen.getByText('1 in queue')).toBeInTheDocument()
    })
  })

  it('renders zone select screen with zones', async () => {
    mockApi.get.mockResolvedValue({ ok: true, data: [{ zone: 'A', count: 5 }] })
    render(<PutawayWizard />)
    fireEvent.click(screen.getByText('By Zone'))
    await waitFor(() => {
      expect(screen.getByText('Bicycle/Motorcycle Parts')).toBeInTheDocument()
    })
  })

  it('scan_items: navigates to scan items screen', async () => {
    mockApi.putawayQueue.mockResolvedValue({ ok: true, data: [queuedItem] })
    render(<PutawayWizard />)
    fireEvent.click(screen.getByText('By Item'))
    await waitFor(() => {
      const titles = screen.getAllByText('Scan Items')
      expect(titles.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('scan_items: scan input exists', async () => {
    mockApi.putawayQueue.mockResolvedValue({ ok: true, data: [queuedItem] })
    render(<PutawayWizard />)
    fireEvent.click(screen.getByText('By Item'))
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/scan item barcode/i)).toBeInTheDocument()
    })
  })

  it('zone_select: zone cards render with labels', async () => {
    mockApi.get.mockResolvedValue({ ok: true, data: [{ zone: 'A', count: 5 }, { zone: 'B', count: 3 }] })
    render(<PutawayWizard />)
    fireEvent.click(screen.getByText('By Zone'))
    await waitFor(() => {
      expect(screen.getByText('Bicycle/Motorcycle Parts')).toBeInTheDocument()
      expect(screen.getByText('Tapes & Films')).toBeInTheDocument()
    })
  })

  it('mode_select: back button works from zone_select', async () => {
    mockApi.get.mockResolvedValue({ ok: true, data: [{ zone: 'A', count: 5 }] })
    render(<PutawayWizard />)
    fireEvent.click(screen.getByText('By Zone'))
    await waitFor(() => {
      expect(screen.getByText('Bicycle/Motorcycle Parts')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('vh-back'))
    await waitFor(() => {
      expect(screen.getByText('By Zone')).toBeInTheDocument()
      expect(screen.getByText('By Item')).toBeInTheDocument()
    })
  })

  it('mode_select: back button works from scan_items', async () => {
    mockApi.putawayQueue.mockResolvedValue({ ok: true, data: [queuedItem] })
    render(<PutawayWizard />)
    fireEvent.click(screen.getByText('By Item'))
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/scan item barcode/i)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('vh-back'))
    await waitFor(() => {
      expect(screen.getByText('By Zone')).toBeInTheDocument()
      expect(screen.getByText('By Item')).toBeInTheDocument()
    })
  })

  it('empty state shows when no items in queue', async () => {
    mockApi.putawayQueue.mockResolvedValue({ ok: true, data: [] })
    render(<PutawayWizard />)
    await waitFor(() => {
      expect(screen.getByText('All clear!')).toBeInTheDocument()
      expect(screen.getByText('No items waiting for putaway')).toBeInTheDocument()
    })
  })

  it('empty zone state shows when no zones', async () => {
    mockApi.get.mockResolvedValue({ ok: true, data: [] })
    render(<PutawayWizard />)
    fireEvent.click(screen.getByText('By Zone'))
    await waitFor(() => {
      expect(screen.getByText('No zones ready')).toBeInTheDocument()
      expect(screen.getByText('No items are staged for putaway')).toBeInTheDocument()
    })
  })
})