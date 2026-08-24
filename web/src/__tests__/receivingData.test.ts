// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { mergeReceivingChoices, cameraErrorMessage } from '../utils/receivingData'

describe('mobile receiving data', () => {
  it('includes packing-list sessions when the PO endpoint omits the linked PO', () => {
    const choices = mergeReceivingChoices(
      [],
      [{
        id: 42,
        name: 'GRN-2026-00042',
        po_no: 'PO-1001',
        supplier_name: 'Acme',
        status: 'open',
        total_boxes: 3,
        total_items: 4,
        total_qty: 12,
        purchase_order_id: 0,
      }],
    )

    expect(choices).toHaveLength(1)
    expect(choices[0]).toMatchObject({
      id: 0,
      name: 'PO-1001',
      resume_session_id: 42,
      item_count: 4,
      total_qty: 12,
    })
  })

  it('shows an open packing-list session even when its PO number is blank', () => {
    const choices = mergeReceivingChoices([], [{
      id: 5,
      name: 'GRN-2026-00006',
      po_no: '',
      supplier_name: 'Acme',
      status: 'receiving',
      total_boxes: 2,
      total_items: 3,
      total_qty: 8,
    }])

    expect(choices).toHaveLength(1)
    expect(choices[0]).toMatchObject({
      id: 0,
      name: 'GRN-2026-00006',
      resume_session_id: 5,
    })
  })

  it('does not duplicate a PO already returned by the PO endpoint', () => {
    const choices = mergeReceivingChoices(
      [{ id: 7, name: 'PO-1001', supplier_name: 'Acme', status: 'submitted', item_count: 2, total_qty: 5 }],
      [{ id: 42, name: 'GRN-2026-00042', po_no: 'PO-1001', supplier_name: 'Acme', status: 'open', total_boxes: 3, total_items: 4, total_qty: 12 }],
    )

    expect(choices).toHaveLength(1)
    expect(choices[0].id).toBe(7)
    expect(choices[0].resume_session_id).toBe(42)
  })
})

describe('camera diagnostics', () => {
  it('explains the common mobile permission and browser failures', () => {
    expect(cameraErrorMessage('NotAllowedError')).toMatch(/permission/i)
    expect(cameraErrorMessage('NotFoundError')).toMatch(/camera/i)
    expect(cameraErrorMessage('SecurityError')).toMatch(/HTTPS|secure/i)
    expect(cameraErrorMessage('NotSupportedError')).toMatch(/browser|camera/i)
  })
})

describe('receiving wizard states', () => {
  it('produces an empty list when both sources are empty', () => {
    const choices = mergeReceivingChoices([], []);
    expect(choices).toHaveLength(0);
    // Empty state renders no choices — selector should show "no eligible work"
  });

  it('deduplicates a PO that appears in both sources with different session IDs', () => {
    const choices = mergeReceivingChoices(
      [
        { id: 1, name: 'PO-001', supplier_name: 'Acme', status: 'submitted', item_count: 2, total_qty: 10, open_sessions: 1, resume_session_id: 99 },
      ],
      [
        { id: 100, name: 'GRN-XYZ', po_no: 'PO-001', supplier_name: 'Acme', status: 'open', total_items: 2, total_qty: 5 },
      ],
    );

    expect(choices).toHaveLength(1);
    // Deduplication keeps the PO row and preserves its original ID.
    expect(choices[0].id).toBe(1);
    // The more recent session's resume ID takes priority.
    expect(choices[0].resume_session_id).toBe(100);
  });

  it('preserves a session with supplier name but no PO link', () => {
    const choices = mergeReceivingChoices(
      [],
      [{ id: 10, name: 'GRN-NO-PO', po_no: '', supplier_name: 'Global Supply Co', status: 'open', total_items: 1, total_qty: 50 }],
    );

    expect(choices).toHaveLength(1);
    expect(choices[0].supplier_name).toBe('Global Supply Co');
    expect(choices[0].resume_session_id).toBe(10);
  });
});
