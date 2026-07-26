/**
 * @jest-environment jsdom
 */

import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { HorizonTransactionList } from '../horizon-transaction-list'
import { DEFAULT_TRANSACTION_FILTERS, type TransactionFilters } from '../types'
import * as horizonApi from '@/lib/api/horizon-transactions'

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

  describe('filtering', () => {
    function FilterableList() {
      const [filters, setFilters] = useState<TransactionFilters>(DEFAULT_TRANSACTION_FILTERS)
      return (
        <HorizonTransactionList account={ACCOUNT} filters={filters} onFiltersChange={setFilters} />
      )
    }

    const records: horizonApi.HorizonOperationRecord[] = [
      {
        ...baseOp,
        id: '1',
        transaction_hash: 'hash-xlm-success',
        asset_code: undefined,
        transaction_successful: true,
        created_at: '2024-01-05T10:00:00Z',
      },
      {
        ...baseOp,
        id: '2',
        transaction_hash: 'hash-usdc-failed',
        asset_code: 'USDC',
        transaction_successful: false,
        created_at: '2024-01-20T10:00:00Z',
      },
      {
        ...baseOp,
        id: '3',
        transaction_hash: 'hash-usdc-success',
        asset_code: 'USDC',
        transaction_successful: true,
        created_at: '2024-02-10T10:00:00Z',
      },
    ]

    it('narrows the visible list when combining asset, status, and date filters', async () => {
      mockFetch.mockResolvedValueOnce({ records })
      const user = userEvent.setup()

      render(<FilterableList />)

      await waitFor(() => {
        expect(screen.getByText('hash-xlm-success')).toBeInTheDocument()
      })
      expect(screen.getByText('hash-usdc-failed')).toBeInTheDocument()
      expect(screen.getByText('hash-usdc-success')).toBeInTheDocument()

      await user.selectOptions(screen.getByLabelText('Filter by asset'), 'USDC')
      await user.selectOptions(screen.getByLabelText('Filter by status'), 'success')
      await user.type(screen.getByLabelText('Filter by start date'), '2024-02-01')

      await waitFor(() => {
        expect(screen.queryByText('hash-xlm-success')).not.toBeInTheDocument()
        expect(screen.queryByText('hash-usdc-failed')).not.toBeInTheDocument()
        expect(screen.getByText('hash-usdc-success')).toBeInTheDocument()
      })
    })

    it('shows a no-matches state and restores the full list on clear', async () => {
      mockFetch.mockResolvedValueOnce({ records })
      const user = userEvent.setup()

      render(<FilterableList />)

      await waitFor(() => {
        expect(screen.getByText('hash-xlm-success')).toBeInTheDocument()
      })

      await user.selectOptions(screen.getByLabelText('Filter by asset'), 'USDC')
      await user.selectOptions(screen.getByLabelText('Filter by status'), 'success')
      await user.type(screen.getByLabelText('Filter by start date'), '2024-01-01')
      await user.type(screen.getByLabelText('Filter by end date'), '2024-01-31')

      await waitFor(() => {
        expect(screen.getByText(/no matching transactions/i)).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /clear filters/i }))

      await waitFor(() => {
        expect(screen.getByText('hash-xlm-success')).toBeInTheDocument()
        expect(screen.getByText('hash-usdc-failed')).toBeInTheDocument()
        expect(screen.getByText('hash-usdc-success')).toBeInTheDocument()
      })
    })
  })
})
