import { ReactNode, useState, useCallback, useMemo } from 'react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Modal } from '../modal/Modal'

export interface FormFieldConfig<TValues> {
  name: string
  label: string
  type: 'text' | 'number' | 'select' | 'date' | 'textarea' | 'autocomplete'
  required?: boolean
  placeholder?: string
  options?: { value: string; label: string }[]
  autocomplete?: {
    api: (q: string) => Promise<unknown[]>
    render: (item: unknown) => ReactNode
    options?: { value: string; label: string }[]
  }
  validation?: (value: unknown) => string | null
  className?: string
}

export interface FormPageProps<TValues extends Record<string, unknown>> {
  title: string
  description?: string
  fields: FormFieldConfig<TValues>[][]
  onSubmit: (data: TValues) => Promise<void>
  onCancel: () => void
  submitLabel?: string
  cancelLabel?: string
  isLoading?: boolean
  initialValues?: Partial<TValues>
  modal?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function FormPage<TValues extends Record<string, unknown>>({
  title,
  description,
  fields,
  onSubmit,
  onCancel,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  isLoading = false,
  initialValues = {},
  modal = false,
  size = 'md',
}: FormPageProps<TValues>) {
  const [formData, setFormData] = useState<Partial<TValues>>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showModal, setShowModal] = useState(modal)

  const validateField = useCallback(
    (name: keyof TValues, value: unknown) => {
      const fieldConfig = fields.flat().find((f) => f.name === name)
      if (!fieldConfig?.validation) return null
      return fieldConfig.validation(value)
    },
    [fields]
  )

  const handleChange = useCallback(
    (name: keyof TValues, value: unknown) => {
      setFormData((prev) => ({ ...prev, [name]: value }))
      if (errors[name as string]) {
        setErrors((prev) => {
          const next = { ...prev }
          delete next[name as string]
          return next
        })
      }
    },
    [errors]
  )

  const handleBlur = useCallback(
    (name: keyof TValues, value: unknown) => {
      const error = validateField(name, value)
      if (error) {
        setErrors((prev) => ({ ...prev, [name as string]: error }))
      }
    },
    [validateField]
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const newErrors: Record<string, string> = {}
    let hasErrors = false

    for (const field of fields.flat()) {
      const value = formData[field.name]
      if (field.required && (value === undefined || value === '' || (Array.isArray(value) && value.length === 0))) {
        newErrors[field.name as string] = `${field.label} is required`
        hasErrors = true
      } else if (value !== undefined && value !== '') {
        const error = validateField(field.name, value)
        if (error) {
          newErrors[field.name as string] = error
          hasErrors = true
        }
      }
    }

    setErrors(newErrors)
    if (hasErrors) return

    setIsSubmitting(true)
    try {
      await onSubmit(formData as TValues)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    if (modal) {
      setShowModal(false)
    }
    onCancel()
  }

  const renderField = (field: FormFieldConfig<any>) => {
    const value = formData[field.name]
    const error = errors[field.name as string]
    const inputClassName = 'erpnext-input'

    if (field.type === 'select') {
      return (
        <div className="field" key={field.name} style={{ minWidth: 160, flex: 1 }}>
          <label className="erpnext-label">{field.label}{field.required && <span className="text-red-500 ml-1">*</span>}</label>
          <select
            className="erpnext-input"
            value={String(value ?? '')}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleChange(field.name, e.target.value)}
            onBlur={(e) => handleBlur(field.name, (e.target as HTMLSelectElement).value)}
            required={field.required}
            disabled={isSubmitting || isLoading}
          >
            <option value="">Select...</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      )
    }
    if (field.type === 'date') {
      return (
        <div className="field" key={field.name} style={{ minWidth: 160, flex: 1 }}>
          <label className="erpnext-label">{field.label}{field.required && <span className="text-red-500 ml-1">*</span>}</label>
          <input
            type="date"
            className="erpnext-input"
            value={value as string}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(field.name, e.target.value)}
            onBlur={(e) => handleBlur(field.name, (e.target as HTMLInputElement).value)}
            required={field.required}
            disabled={isSubmitting || isLoading}
          />
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      )
    }
    if (field.type === 'number') {
      return (
        <div className="field" key={field.name} style={{ minWidth: 120, flex: 1 }}>
          <label className="erpnext-label">{field.label}{field.required && <span className="text-red-500 ml-1">*</span>}</label>
          <input
            type="number"
            className="erpnext-input"
            value={value as string}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(field.name, e.target.value)}
            onBlur={(e) => handleBlur(field.name, (e.target as HTMLInputElement).value)}
            placeholder={field.placeholder}
            required={field.required}
            disabled={isSubmitting || isLoading}
            step="any"
          />
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      )
    }
    if (field.type === 'textarea') {
      return (
        <div className="field" key={field.name} style={{ flex: 1, minWidth: 200 }}>
          <label className="erpnext-label">{field.label}{field.required && <span className="text-red-500 ml-1">*</span>}</label>
          <textarea
            className="erpnext-input"
            value={value as string}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleChange(field.name, e.target.value)}
            onBlur={(e) => handleBlur(field.name, (e.target as HTMLTextAreaElement).value)}
            placeholder={field.placeholder}
            required={field.required}
            disabled={isSubmitting || isLoading}
            rows={3}
          />
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      )
    }
    if (field.type === 'autocomplete') {
      return (
        <div className="field" key={field.name} style={{ flex: 1, minWidth: 200 }}>
          <label className="erpnext-label">{field.label}{field.required && <span className="text-red-500 ml-1">*</span>}</label>
          <input
            type="text"
            className="erpnext-input"
            value={value as string}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(field.name, e.target.value)}
            onBlur={(e) => handleBlur(field.name, (e.target as HTMLInputElement).value)}
            placeholder={field.placeholder}
            required={field.required}
            disabled={isSubmitting || isLoading}
            list={`${field.name}-autocomplete`}
          />
          {field.autocomplete?.options && (
            <datalist id={`${field.name}-autocomplete`}>
              {field.autocomplete.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </datalist>
          )}
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      )
    }
    // default
    return (
      <div className="field" key={field.name as string} style={{ flex: 1, minWidth: 160 }}>
        <label className="erpnext-label">{field.label}{field.required && <span className="text-red-500 ml-1">*</span>}</label>
        <input
          type="text"
          className="erpnext-input"
          value={value as string}
          onChange={(e) => handleChange(field.name, e.target.value)}
          onBlur={(e) => handleBlur(field.name, (e.target as HTMLInputElement).value)}
          placeholder={field.placeholder}
          required={field.required}
          disabled={isSubmitting || isLoading}
        />
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      </div>
    )
  }

  const content = (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="rw-form-grid">
        {fields.map((section, sectionIndex) => (
          <div key={sectionIndex} className="space-y-4">
            {section.map(renderField)}
          </div>
        ))}
      </div>
      <div className="rw-modal-footer flex justify-end gap-2 pt-4 border-t border-border">
        <Button
          variant="secondary"
          onClick={handleCancel}
          disabled={isSubmitting || isLoading}
        >
          {cancelLabel}
        </Button>
        <Button
          type="submit"
          variant="default"
          disabled={isSubmitting || isLoading}
          
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  )

  if (modal) {
    return (
      <Modal
        isOpen={showModal}
        onClose={handleCancel}
        title={title}
        size={size}
        className="rw-modal"
      >
        {description && <p className="text-sm text-text-dim mb-4">{description}</p>}
        {content}
      </Modal>
    )
  }

  return (
    <div className="rw-page">
      <div className="rw-page-head">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{title}</h1>
          {description && <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>{description}</p>}
        </div>
      </div>
      <div className="erpnext-card">
        <div className="p-6 space-y-4">
          {content}
        </div>
      </div>
    </div>
  )
}