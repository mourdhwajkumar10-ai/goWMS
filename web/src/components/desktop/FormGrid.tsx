import * as React from 'react'
import { cn } from '../../lib/utils'

export function FormGrid({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('form-grid', className)} {...props} />
}

export function FormControl({ className, span, ...props }: React.HTMLAttributes<HTMLDivElement> & { span?: 2 | 3 }) {
  return <div className={cn('form-control', span && `span-${span}`, className)} {...props} />
}

export function FormLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('erpnext-label', className)} {...props} />
}
