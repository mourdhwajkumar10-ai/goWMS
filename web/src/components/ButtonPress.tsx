import type { ReactNode } from 'react'

interface ButtonPressProps {
  children: ReactNode
  onClick?: () => void
  className?: string
  disabled?: boolean
  as?: 'button' | 'div' | 'a'
}

export default function ButtonPress({
  children,
  onClick,
  className = '',
  disabled = false,
  as = 'button',
}: ButtonPressProps) {
  const style = {
    cursor: disabled ? 'not-allowed' : undefined,
    opacity: disabled ? 0.5 : undefined,
  }

  const handlePress = () => {
    if (disabled) return
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10)
    }
    onClick?.()
  }

  const sharedProps = {
    className: `button-press${className ? ` ${className}` : ''}`,
    style,
    onClick: handlePress,
  }

  if (as === 'div') {
    return <div {...sharedProps}>{children}</div>
  }
  if (as === 'a') {
    return <a {...sharedProps}>{children}</a>
  }
  return <button {...sharedProps} disabled={disabled}>{children}</button>
}
