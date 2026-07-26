'use client'

import { SupportTypingIndicator } from './support-typing-indicator'
import { useTicketTyping } from '@/hooks/useTicketTyping'

export interface TicketThreadMessage {
  id: string
  author: 'customer' | 'support'
  body: string
  createdAt: string
}

export interface TicketThreadProps {
  ticketId: string
  subject: string
  status: string
  messages: TicketThreadMessage[]
  /** Optional override for tests — when set, skips the live hook. */
  isTypingOverride?: boolean
}

/**
 * Customer-facing ticket thread. Shows existing messages and a typing
 * indicator while staff is composing a reply on this ticket.
 */
export function TicketThread({
  ticketId,
  subject,
  status,
  messages,
  isTypingOverride,
}: TicketThreadProps) {
  const live = useTicketTyping(isTypingOverride === undefined ? ticketId : null)
  const isTyping = isTypingOverride ?? live.isTyping

  return (
    <section
      data-testid="ticket-thread"
      aria-label={`Ticket ${ticketId}`}
      className="space-y-4"
    >
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{subject}</h2>
        <p className="text-sm text-muted-foreground">
          Status: <span className="font-medium text-foreground">{status}</span>
        </p>
      </header>

      <ul className="space-y-3" aria-label="Conversation">
        {messages.map((m) => (
          <li
            key={m.id}
            data-testid={`ticket-message-${m.id}`}
            className={
              m.author === 'support'
                ? 'rounded-md bg-muted/60 px-3 py-2 text-sm'
                : 'rounded-md border px-3 py-2 text-sm'
            }
          >
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {m.author === 'support' ? 'Support' : 'You'}
            </p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ul>

      <SupportTypingIndicator isTyping={isTyping} />
    </section>
  )
}
