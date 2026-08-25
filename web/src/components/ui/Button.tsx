import * as React from 'react'
import { cn } from '../../lib/utils'

// API compatible with scanmaster-main/components/ui/button.tsx but using plain CSS (no Tailwind merge)
type Variant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
type Size = 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg'

const variantClass: Record<Variant, string> = {
  default: 'btn',
  outline: 'btn-ghost',
  secondary: 'scan-btn scan-btn-outline',
  ghost: 'btn-ghost',
  destructive: 'btn-danger',
  link: 'link-btn',
}

const sizeClass: Record<Size, string> = {
  default: '',
  xs: 'btn-sm',
  sm: 'btn-sm',
  lg: '',
  icon: 'scan-icon-btn',
  'icon-xs': 'scan-icon-btn',
  'icon-sm': 'scan-icon-btn',
  'icon-lg': 'scan-icon-btn',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(variantClass[variant], sizeClass[size], className)}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export const buttonVariants = variantClass
