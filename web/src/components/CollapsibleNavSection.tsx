import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

type Props = {
  id: string
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
  /** Extra class on the section wrapper (desk vs floor). */
  className?: string
}

/** Accordion section for desk sidebar / floor drawer. */
export default function CollapsibleNavSection({
  id,
  title,
  open,
  onToggle,
  children,
  className,
}: Props) {
  const panelId = `nav-section-panel-${id}`
  return (
    <div className={className ? `nav-section-block ${className}` : 'nav-section-block'}>
      <button
        type="button"
        className="nav-section-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="nav-section-toggle-label">{title}</span>
        <ChevronDown
          className={`nav-section-chevron ${open ? 'open' : ''}`}
          size={14}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      <div
        id={panelId}
        className={`nav-section-panel ${open ? 'open' : 'closed'}`}
        hidden={!open}
      >
        {children}
      </div>
    </div>
  )
}
