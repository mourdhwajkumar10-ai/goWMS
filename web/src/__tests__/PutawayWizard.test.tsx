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
      onChange={(e) => onScan(e.target.value)}
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

vi.mock('../hooks/useHaptic', () => ({
  useHaptic: () => vi.fn(),
}))

vi.mock('../styles/putaway-wizard.css', () => ({}))

const mockApi = vi.mocked(api)

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.putawayQueue.mockResolvedValue({ ok: true, data: [] })
  mockApi.get.mockResolvedValue({ ok: true, data: [] })
})

const queuedItem = {
  id: 1, item_code: 'ITEM-1', item_name: 'Test', warehouse_id: 1,
  warehouse_code: 'WH1', location_id: 1, location_code: 'LOC1',
  batch_no: 'B1', qty: 10, location_type: 'bin', zone: 'A',
  suggested_location_code: 'BIN-1',
}

describe('PutawayWizard', () => {
  it('renders mode select screen with two mode cards', () => {
    render(<PutawayWizard />)
    expect(screen.getByText('Putaway')).toBeInTheDocument()
    expect(screen.getByText('By Zone')).toBeInTheDocument()
    expect(screen.getByText('By Item')).toBeInTheDocument()
  })

  it('displays queue count in banner', async () => {
    mockApi.putawayQueue.mockResolvedValue({ ok: true, data: [queuedItem] })
    render(<PutawayWizard />)
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
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

  it('adds items to tote on pick', async () => {
    mockApi.putawayQueue.mockResolvedValue({ ok: true, data: [queuedItem] })
    mockApi.post.mockResolvedValue({ ok: true, data: { id: 100 } })
    render(<PutawayWizard />)
    fireEvent.click(screen.getByText('By Item'))
    await waitFor(() => {
      expect(screen.getByText('Pick')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Pick'))
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/putaway/sessions', expect.anything())
    })
  })

  it('shows counter with X of N items in tote header', async () => {
    mockApi.putawayQueue.mockResolvedValue({ ok: true, data: [queuedItem] })
    mockApi.post.mockResolvedValue({ ok: true, data: { id: 100 } })
    render(<PutawayWizard />)
    fireEvent.click(screen.getByText('By Item'))
    await waitFor(() => {
      fireEvent.click(screen.getByText('Pick'))
    })
    await waitFor(() => {
      expect(screen.getByText(/1 of 1/)).toBeInTheDocument()
    })
  })

  it('shows progress bar on putaway screen', async () => {
    mockApi.putawayQueue.mockResolvedValue({ ok: true, data: [queuedItem] })
    mockApi.post.mockResolvedValue({ ok: true, data: { id: 100 } })
    mockApi.putawaySuggest.mockResolvedValue({
      ok: true,
      data: { location_id: 2, location_code: 'BIN-2', reason: 'Velocity', free_capacity: 100, on_hand_qty: 0, candidates: [], velocity_tier: 'A', shelf_band: '1' },
    })
    render(<PutawayWizard />)
    fireEvent.click(screen.getByText('By Item'))
    await waitFor(() => fireEvent.click(screen.getByText('Pick')))
    await waitFor(() => fireEvent.click(screen.getByText('Start Putaway →')))
    await waitFor(() => {
      expect(screen.getByText(/Placing item/)).toBeInTheDocument()
    })
  })

  it('shows suggestion card on putaway screen', async () => {
    mockApi.putawayQueue.mockResolvedValue({ ok: true, data: [queuedItem] })
    mockApi.post.mockResolvedValue({ ok: true, data: { id: 100 } })
    mockApi.putawaySuggest.mockResolvedValue({
      ok: true,
      data: { location_id: 2, location_code: 'BIN-2', reason: 'Velocity', free_capacity: 100, on_hand_qty: 0, candidates: [], velocity_tier: 'A', shelf_band: '1' },
    })
    render(<PutawayWizard />)
    fireEvent.click(screen.getByText('By Item'))
    await waitFor(() => fireEvent.click(screen.getByText('Pick')))
    await waitFor(() => fireEvent.click(screen.getByText('Start Putaway →')))
    await waitFor(() => {
      expect(screen.getAllByText('BIN-2').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('⇨ Suggested Location')).toBeInTheDocument()
    })
  })

  it('renders fit exception panel', async () => {
    mockApi.putawayQueue.mockResolvedValue({ ok: true, data: [queuedItem] })
    mockApi.post.mockResolvedValue({ ok: true, data: { id: 100 } })
    mockApi.putawaySuggest.mockResolvedValue({
      ok: true,
      data: { location_id: 2, location_code: 'BIN-2', reason: 'Velocity', free_capacity: 100, on_hand_qty: 0, candidates: [], velocity_tier: 'A', shelf_band: '1' },
    })
    render(<PutawayWizard />)
    fireEvent.click(screen.getByText('By Item'))
    await waitFor(() => fireEvent.click(screen.getByText('Pick')))
    await waitFor(() => fireEvent.click(screen.getByText('Start Putaway →')))
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Doesn't fit/))
    })
    await waitFor(() => {
      expect(screen.getByText(/What's wrong\?/)).toBeInTheDocument()
    })
  })

  it('renders complete screen with results', async () => {
    mockApi.putawayQueue.mockResolvedValue({ ok: true, data: [queuedItem] })
    mockApi.post.mockResolvedValue({ ok: true, data: { id: 100 } })
    mockApi.putawaySuggest.mockResolvedValue({
      ok: true,
      data: { location_id: 2, location_code: 'BIN-2', reason: 'Velocity', free_capacity: 100, on_hand_qty: 0, candidates: [], velocity_tier: 'A', shelf_band: '1' },
    })
    render(<PutawayWizard />)
    fireEvent.click(screen.getByText('By Item'))
    await waitFor(() => fireEvent.click(screen.getByText('Pick')))
    await waitFor(() => fireEvent.click(screen.getByText('Start Putaway →')))
    await waitFor(() => {
      expect(screen.getAllByText('BIN-2').length).toBeGreaterThanOrEqual(1)
    })
    mockApi.post.mockResolvedValue({ ok: true, data: {} })
    const scanInput = screen.getByPlaceholderText('Scan bin barcode or type location...')
    fireEvent.change(scanInput, { target: { value: 'BIN-2' } })
    await waitFor(() => {
      expect(screen.getByText('Putaway Complete')).toBeInTheDocument()
    })
  })
})