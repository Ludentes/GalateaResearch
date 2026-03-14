import type React from "react"

interface SettingInputProps {
  label: string
  description?: string
  type?: "number" | "text"
  value: string | number
  onChange: (value: string | number) => void
  min?: number
  max?: number
  step?: number
  error?: string
}

export function SettingInput({
  label,
  description,
  type = "text",
  value,
  onChange,
  min,
  max,
  step,
  error,
}: SettingInputProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">{label}</label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => {
          const val =
            type === "number" ? parseInt(e.target.value, 10) : e.target.value
          onChange(val)
        }}
        min={min}
        max={max}
        step={step}
        className={`w-full px-3 py-2 border rounded-md text-sm ${
          error ? "border-red-500" : "border-input"
        }`}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
