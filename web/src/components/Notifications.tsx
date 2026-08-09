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
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
    <button class="toast-close">✕</button>
  `

  const close = () => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateX(100%)'
    toast.style.transition = 'all 0.2s ease-in'
    setTimeout(() => toast.remove(), 200)
  }

  toast.querySelector('.toast-close')?.addEventListener('click', close)
  c.appendChild(toast)

  if (duration > 0) {
    setTimeout(close, duration)
  }
}

export default function Notifications() {
  return null
}
