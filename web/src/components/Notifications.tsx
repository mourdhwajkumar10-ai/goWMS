import { useCallback, useRef } from 'react'

interface NotifyOpts {
  type: 'success' | 'warning' | 'error' | 'info'
  title: string
  message?: string
  duration?: number
}

let container: HTMLDivElement | null = null

function getContainer() {
  if (!container) {
    container = document.createElement('div')
    container.className = 'toast-container'
    document.body.appendChild(container)
  }
  return container
}

export function notify({ type, title, message, duration = 4000 }: NotifyOpts) {
  const c = getContainer()

  const icons: Record<string, string> = {
    success: '✓',
    warning: '⚠',
    error: '✕',
    info: 'ℹ',
  }

  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`

  const icon = document.createElement('span')
  icon.className = 'toast-icon'
  icon.textContent = icons[type]

  const body = document.createElement('div')
  body.className = 'toast-body'
  const titleEl = document.createElement('div')
  titleEl.className = 'toast-title'
  titleEl.textContent = title
  body.appendChild(titleEl)
  if (message) {
    const msgEl = document.createElement('div')
    msgEl.className = 'toast-message'
    msgEl.textContent = message
    body.appendChild(msgEl)
  }

  const closeBtn = document.createElement('button')
  closeBtn.className = 'toast-close'
  closeBtn.type = 'button'
  closeBtn.textContent = '✕'

  toast.appendChild(icon)
  toast.appendChild(body)
  toast.appendChild(closeBtn)

  const close = () => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateX(100%)'
    toast.style.transition = 'all 0.2s ease-in'
    setTimeout(() => toast.remove(), 200)
  }

  closeBtn.addEventListener('click', close)
  c.appendChild(toast)

  if (duration > 0) {
    setTimeout(close, duration)
  }
}

export default function Notifications() {
  return null
}
