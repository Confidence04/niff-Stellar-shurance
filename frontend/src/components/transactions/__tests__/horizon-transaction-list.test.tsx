/**
 * @jest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { HorizonTransactionList } from '../horizon-transaction-list'
import * as horizonApi from '@/lib/api/horizon-transactions'
import { buildTransactionsCsv } from '@/lib/export-transactions-csv'

jest.mock('@/lib/api/horizon-transactions')

const mockFetch = horizonApi.fetchHorizonTransactions as jest.MockedFunction<
  typeof horizonApi.fetchHorizonTransactions
>

const ACCOUNT = 'GBCPNZ6S7RK5N4BX6HBXBCX7P5QNBOJZFGDWBZBXCLK5T6KHWOPTLR3I'

const baseOp: horizonApi.HorizonOperationRecord = {
  id: '1',
  paging_token: 'token-1',
  type: 'payment',
  type_int: 1,
  created_at: '2024-01-15T10:00:00Z',
  transaction_hash: 'hash-abc',
  transaction_successful: true,
  source_account: ACCOUNT,
  amount: '10.0000000',
  asset_type: 'native',
}

beforeEach(() => {
  mockFetch.mockReset()
  mockIntersectionObserver()
})

function mockIntersectionObserver(isIntersecting = false) {
  class IO {
    private cb: IntersectionObserverCallback
    constructor(cb: IntersectionObserverCallback) {
      this.cb = cb
    }
    observe() {
      this.cb([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
    }
    unobserve() {}
    disconnect() {}
  }
  global.IntersectionObserver = IO as unknown as typeof IntersectionObserver
}

describe('HorizonTransactionList', () => {
  it('renders contract event descriptions alongside operation data', async () => {
    mockFetch.mockResolvedValueOnce({
      records: [
        {
          ...baseOp,
          contractEvents: [{ description: 'Filed claim #42 for policy #7' }],
        },
      ],
    })

    render(<HorizonTransactionList account={ACCOUNT} />)

    await waitFor(() => {
      expect(screen.getByText('Filed claim #42 for policy #7')).toBeInTheDocument()
    })
    expect(screen.getByText(/payment · 10\.0000000 XLM/)).toBeInTheDocument()
    expect(screen.getByText('hash-abc')).toBeInTheDocument()
  })

  it('renders empty state when the API returns no transactions', async () => {
    mockFetch.mockResolvedValueOnce({ records: [] })

    render(<HorizonTransactionList account={ACCOUNT} />)

    await waitFor(() => {
      expect(screen.getByText(/no transactions yet/i)).toBeInTheDocument()
    })
  })

  it('loads the next page when the sentinel intersects', async () => {
    mockIntersectionObserver(true)

    mockFetch
      .mockResolvedValueOnce({
        records: [{ ...baseOp, id: '1' }],
        next_cursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        records: [
          {
            ...baseOp,
            id: '2',
            paging_token: 'token-2',
            transaction_hash: 'hash-def',
          },
        ],
      })

    render(<HorizonTransactionList account={ACCOUNT} />)

    await waitFor(() => {
      expect(screen.getByText('hash-abc')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(screen.getByText('hash-def')).toBeInTheDocument()
    })

    expect(mockFetch.mock.calls[1][1]).toBe('cursor-2')
  })
})

describe('Export CSV', () => {
  beforeEach(() => {
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url')
    global.URL.revokeObjectURL = jest.fn()
  })

  it('shows the Export CSV button when records are loaded', async () => {
    mockFetch.mockResolvedValueOnce({ records: [baseOp] })

    render(<HorizonTransactionList account={ACCOUNT} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument()
    })
  })

  it('does not show the Export CSV button while loading', () => {
    mockFetch.mockReturnValue(new Promise(() => {}))

    render(<HorizonTransactionList account={ACCOUNT} />)

    expect(screen.queryByRole('button', { name: /export csv/i })).not.toBeInTheDocument()
  })

  it('triggers a CSV download when the export button is clicked', async () => {
    const user = userEvent.setup()

    mockFetch.mockResolvedValueOnce({ records: [baseOp] })

    render(<HorizonTransactionList account={ACCOUNT} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /export csv/i }))

    expect(global.URL.createObjectURL).toHaveBeenCalled()
    expect(global.URL.revokeObjectURL).toHaveBeenCalled()
  })
})

describe('buildTransactionsCsv', () => {
  it('produces a header-only CSV for empty records', () => {
    const csv = buildTransactionsCsv([])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe('Date,Type,Amount,Asset,Tx Hash,Status,Contract Events,Raw Timestamp')
  })

  it('includes all visible columns plus raw timestamp', () => {
    const csv = buildTransactionsCsv([baseOp])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)

    const dataRow = lines[1]
    expect(dataRow).toContain('payment')
    expect(dataRow).toContain('10.0000000')
    expect(dataRow).toContain('XLM')
    expect(dataRow).toContain('hash-abc')
    expect(dataRow).toContain('success')
    expect(dataRow).toContain('2024-01-15T10:00:00Z')
  })

  it('includes contract events joined by semicolons', () => {
    const csv = buildTransactionsCsv([
      {
        ...baseOp,
        contractEvents: [
          { description: 'Event A' },
          { description: 'Event B' },
        ],
      },
    ])
    const lines = csv.split('\n')
    expect(lines[1]).toContain('Event A; Event B')
  })

  it('escapes fields containing commas', () => {
    const csv = buildTransactionsCsv([
      {
        ...baseOp,
        contractEvents: [{ description: 'Sold 100 USDC, bought 50 XLM' }],
      },
    ])
    const lines = csv.split('\n')
    expect(lines[1]).toContain('"Sold 100 USDC, bought 50 XLM"')
  })

  it('escapes fields containing double quotes', () => {
    const csv = buildTransactionsCsv([
      {
        ...baseOp,
        contractEvents: [{ description: 'Called "transfer" method' }],
      },
    ])
    const lines = csv.split('\n')
    expect(lines[1]).toContain('"Called ""transfer"" method"')
  })

  it('shows failed status for unsuccessful transactions', () => {
    const csv = buildTransactionsCsv([
      { ...baseOp, transaction_successful: false },
    ])
    const lines = csv.split('\n')
    expect(lines[1]).toContain('failed')
  })

  it('leaves amount and asset empty for operations without amounts', () => {
    const csv = buildTransactionsCsv([
      {
        ...baseOp,
        type: 'set_options',
        amount: undefined,
      },
    ])
    const lines = csv.split('\n')
    const fields = lines[1].split(',')
    expect(fields[2]).toBe('')
    expect(fields[3]).toBe('')
  })
})
