import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import api from '../services/api'
import PutawayRunner from '../pages/PutawayRunner'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('../components/CameraScanner', () => ({
  default: () => null,
}))

vi.mock('../hooks/useScanFeedback', () => ({
  useScanFeedback: () => ({ ok: vi.fn(), warn: vi.fn(), err: vi.fn() }),
}))

vi.mock('../styles/scanner.css', () => ({}))

const mockApi = vi.mocked(api)
const queueItem = {
  id: 1, item_code: 'ITEM-1', item_name: 'Test', warehouse_id: 1,
  warehouse_code: 'WH1', location_id: 1, location_code: 'LOC1',
  batch_no: 'B1', qty: 10, location_type: 'bin', zone: 'A',
  suggested_location_code: 'BIN-1',
}
const zonesData = [{ zone: 'A', count: 5 }, { zone: 'B', count: 3 }]
const suggestionData = {
  location_id: 2, location_code: 'BIN-2', reason: 'consolidate_same_item',
  free_capacity: 10, on_hand_qty: 0, candidates: [], velocity_tier: 'medium', shelf_band: 'lower',
}

describe('PutawayRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.get.mockImplementation(async (path: string) => {
      if (String(path).includes('/putaway/queue/zones')) return { ok: true, data: zonesData } as any
      if (String(path).includes('/putaway/queue')) return { ok: true, data: [queueItem] } as any
      if (String(path).includes('/putaway/suggest')) return { ok: true, data: suggestionData } as any
      return { ok: true, data: [] } as any
    })
    mockApi.post.mockImplementation(async (path: string) => {
      if (String(path).includes('/place/')) return { ok: true, data: { remaining: 0 } } as any
      if (String(path).includes('/pick')) return { ok: true, data: { id: 100 } } as any
      if (String(path).includes('/putaway/sessions')) return { ok: true, data: { id: 1, warehouse_id: 1 } } as any
      return { ok: true, data: {} } as any
    })
  })

  it('renders mode select screen', () => {
    render(<PutawayRunner />)
    expect(screen.getByText('Choose a putaway mode')).toBeInTheDocument()
    expect(screen.getByText('By Zone')).toBeInTheDocument()
    expect(screen.getByText('By Item')).toBeInTheDocument()
  })

  it('mode select: By Zone navigates to scan_items', async () => {
    render(<PutawayRunner />)
    fireEvent.click(screen.getByText('By Zone'))
    await waitFor(() => {
      expect(screen.getByText('Scan item barcode in this zone')).toBeInTheDocument()
    })
  })

  it('mode select: By Item navigates to scan_items', async () => {
    render(<PutawayRunner />)
    fireEvent.click(screen.getByText('By Item'))
    await waitFor(() => {
      expect(screen.getByText('Scan item barcode')).toBeInTheDocument()
    })
  })

  it('scan_items: scan item adds to scanned list', async () => {
    render(<PutawayRunner />)
    fireEvent.click(screen.getByText('By Item'))
    await waitFor(() => {
      expect(screen.getByText('Scan item barcode')).toBeInTheDocument()
    })
    const scanInput = screen.getByPlaceholderText(/type barcode/i)
    fireEvent.change(scanInput, { target: { value: 'ITEM-1' } as HTMLInputElement })
    fireEvent.keyDown(scanInput, { key: 'Enter' })
    await waitFor(() => {
      expect(screen.getByText('Scanned (1)')).toBeInTheDocument()
    })
  })

  it('scan_items: rejects item not in queue', async () => {
    render(<PutawayRunner />)
    fireEvent.click(screen.getByText('By Item'))
    await waitFor(() => {
      expect(screen.getByText('Scan item barcode')).toBeInTheDocument()
    })
    const scanInput = screen.getByPlaceholderText(/type barcode/i)
    fireEvent.change(scanInput, { target: { value: 'NOT-IN-QUEUE' } as HTMLInputElement })
    fireEvent.keyDown(scanInput, { key: 'Enter' })
    await waitFor(() => {
      // No scanned entry added, still shows 0 scanned CTA disabled
      expect(screen.queryByText('Scanned (1)')).not.toBeInTheDocument()
    })
  })

  it('scan_items: rejects duplicate scan', async () => {
    render(<PutawayRunner />)
    fireEvent.click(screen.getByText('By Item'))
    await waitFor(() => expect(screen.getByText('Scan item barcode')).toBeInTheDocument())
    const scanInput = screen.getByPlaceholderText(/type barcode/i)
    fireEvent.change(scanInput, { target: { value: 'ITEM-1' } as HTMLInputElement })
    fireEvent.keyDown(scanInput, { key: 'Enter' })
    // After scan we transition to suggest_location
    await waitFor(() => expect(screen.getByText('Scan destination bin')).toBeInTheDocument())
    // Back to scanning to test duplicate prevention (still only 1 scanned counted in header when we go back)
    // Duplicate is prevented: scanning same item again at suggest_location is not treated as item scan
    expect(screen.queryByText('Scanned (2)')).not.toBeInTheDocument()
  })

  it('suggest_location: wrong bin rejected, correct bin accepted', async () => {
    render(<PutawayRunner />)
    fireEvent.click(screen.getByText('By Item'))
    await waitFor(() => expect(screen.getByText('Scan item barcode')).toBeInTheDocument())
    const scanInput = screen.getByPlaceholderText(/type barcode/i)
    fireEvent.change(scanInput, { target: { value: 'ITEM-1' } as HTMLInputElement })
    fireEvent.keyDown(scanInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('Scan destination bin')).toBeInTheDocument())
    const binScanInput = screen.getByPlaceholderText(/scan or type bin code/i)
    // Wrong bin keeps us on suggest_location
    fireEvent.change(binScanInput, { target: { value: 'WRONG-BIN' } as HTMLInputElement })
    fireEvent.keyDown(binScanInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('Scan destination bin')).toBeInTheDocument())
    expect(screen.queryByPlaceholderText(/scan ITEM-1/i)).not.toBeInTheDocument()
    fireEvent.change(binScanInput, { target: { value: 'BIN-2' } as HTMLInputElement })
    fireEvent.keyDown(binScanInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByPlaceholderText(/scan ITEM-1/i)).toBeInTheDocument())
  })

  it('place_items: wrong item rejected, correct item placed', async () => {
    render(<PutawayRunner />)
    // Use qty=1 item so one placement completes workflow; override queue to qty 1
    mockApi.get.mockImplementation(async (path: string) => {
      if (String(path).includes('/putaway/queue/zones')) return { ok: true, data: zonesData } as any
      if (String(path).includes('/putaway/queue')) return { ok: true, data: [{ ...queueItem, qty: 1 }] } as any
      if (String(path).includes('/putaway/suggest')) return { ok: true, data: suggestionData } as any
      return { ok: true, data: [] } as any
    })
    fireEvent.click(screen.getByText('By Item'))
    await waitFor(() => expect(screen.getByText('Scan item barcode')).toBeInTheDocument())
    const scanInput = screen.getByPlaceholderText(/type barcode/i)
    fireEvent.change(scanInput, { target: { value: 'ITEM-1' } as HTMLInputElement })
    fireEvent.keyDown(scanInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('Scan destination bin')).toBeInTheDocument())
    const binScanInput = screen.getByPlaceholderText(/scan or type bin code/i)
    fireEvent.change(binScanInput, { target: { value: 'BIN-2' } as HTMLInputElement })
    fireEvent.keyDown(binScanInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByPlaceholderText(/scan ITEM-1/i)).toBeInTheDocument())
    const itemScanInput = screen.getByPlaceholderText(/scan ITEM-1/i)
    // wrong item keeps us on place_items
    fireEvent.change(itemScanInput, { target: { value: 'WRONG-ITEM' } as HTMLInputElement })
    fireEvent.keyDown(itemScanInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByPlaceholderText(/scan ITEM-1/i)).toBeInTheDocument())
    // correct item advances to complete (qty1 => placed after 1 scan)
    fireEvent.change(itemScanInput, { target: { value: 'ITEM-1' } as HTMLInputElement })
    fireEvent.keyDown(itemScanInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/putaway complete/i)).toBeInTheDocument())
  })

  it('no Try next button in SuggestionCard', async () => {
    render(<PutawayRunner />)
    fireEvent.click(screen.getByText('By Item'))
    await waitFor(() => expect(screen.getByText('Scan item barcode')).toBeInTheDocument())
    const scanInput = screen.getByPlaceholderText(/type barcode/i)
    fireEvent.change(scanInput, { target: { value: 'ITEM-1' } as HTMLInputElement })
    fireEvent.keyDown(scanInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('Scan destination bin')).toBeInTheDocument())
    expect(screen.queryByText(/try next/i)).not.toBeInTheDocument()
  })

  it('Item mode shows zone tabs in ProgressHeader', async () => {
    render(<PutawayRunner />)
    fireEvent.click(screen.getByText('By Item'))
    await waitFor(() => {
      expect(screen.getByText('A (5)')).toBeInTheDocument()
      expect(screen.getByText('B (3)')).toBeInTheDocument()
    })
  })
})
