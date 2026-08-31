import * as React from 'react'
import { cn } from '../../lib/utils'
import { Button } from './Button'

export interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical'
  spacing?: 'none' | 'sm' | 'md' | 'lg'
  alignment?: 'start' | 'center' | 'end' | 'stretch'
  wrap?: boolean
}

export const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, orientation = 'horizontal', spacing = 'md', alignment = 'start', wrap = false, children, ...props }, ref) => {
    const spacingClass = {
      none: 'gap-0',
      sm: 'gap-2',
      md: 'gap-3',
      lg: 'gap-4',
    }[spacing]

    const alignmentClass = {
      start: orientation === 'horizontal' ? 'justify-start' : 'items-start',
      center: orientation === 'horizontal' ? 'justify-center' : 'items-center',
      end: orientation === 'horizontal' ? 'justify-end' : 'items-end',
      stretch: orientation === 'horizontal' ? 'items-stretch' : 'items-stretch',
    }[alignment]

    const wrapClass = wrap ? 'flex-wrap' : 'flex-nowrap'

    return (
      <div
        ref={ref}
        className={cn(
          'flex',
          orientation === 'horizontal' ? 'flex-row' : 'flex-col',
          spacingClass,
          alignmentClass,
          wrapClass,
          className
        )}
        role="group"
        {...props}
      >
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child
          return React.cloneElement(child as React.ReactElement<any>, {
            className: cn((child.props as any).className),
          })
        })}
      </div>
    )
  }
)
ButtonGroup.displayName = 'ButtonGroup'

export interface ActionBarProps extends React.HTMLAttributes<HTMLDivElement> {
  primary?: React.ReactNode
  secondary?: React.ReactNode
  leading?: React.ReactNode
  trailing?: React.ReactNode
}

export function ActionBar({ className, primary, secondary, leading, trailing, ...props }: ActionBarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3',
        'px-4 py-3 border-t',
        'border-border bg-panel',
        className
      )}
      role="toolbar"
      {...props}
    >
      {leading && <div className="flex items-center gap-2 mr-auto">{leading}</div>}
      {trailing && <div className="flex items-center gap-2 ml-auto">{trailing}</div>}
      {secondary && <div className="flex items-center gap-2 flex-1 justify-center">{secondary}</div>}
      {primary && <div className="flex items-center gap-2 flex-1 justify-end">{primary}</div>}
    </div>
  )
}

export interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  left?: React.ReactNode
  center?: React.ReactNode
  right?: React.ReactNode
}

export function Toolbar({ className, left, center, right, ...props }: ToolbarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3',
        'px-4 py-2 border-b',
        'border-border',
        className
      )}
      role="toolbar"
      {...props}
    >
      {left && <div className="flex items-center gap-2 mr-auto">{left}</div>}
      {center && <div className="flex items-center gap-2 flex-1 justify-center">{center}</div>}
      {right && <div className="flex items-center gap-2 ml-auto">{right}</div>}
    </div>
  )
}