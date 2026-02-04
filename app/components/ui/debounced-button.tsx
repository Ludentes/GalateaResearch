/**
 * Button component with built-in debouncing to prevent accidental multiple clicks.
 * Use this for critical actions like delete, save, submit, etc.
 */

import { useCallback, useRef, useState } from "react"
import { Button, type ButtonProps } from "./button"

interface DebouncedButtonProps extends ButtonProps {
  debounceMs?: number
}

export function DebouncedButton({
  onClick,
  disabled,
  debounceMs = 500,
  children,
  ...props
}: DebouncedButtonProps) {
  const [isDebouncing, setIsDebouncing] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      // Prevent action if already debouncing
      if (isDebouncing) {
        e.preventDefault()
        e.stopPropagation()
        return
      }

      // Call the original onClick handler
      onClick?.(e)

      // Start debounce period
      setIsDebouncing(true)

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        setIsDebouncing(false)
      }, debounceMs)
    },
    [onClick, isDebouncing, debounceMs],
  )

  // If there's no onClick handler, don't wrap it - just use the disabled state
  // This is crucial for type="submit" buttons to work correctly
  if (!onClick) {
    return (
      <Button {...props} disabled={disabled || isDebouncing}>
        {children}
      </Button>
    )
  }

  return (
    <Button
      {...props}
      onClick={handleClick}
      disabled={disabled || isDebouncing}
    >
      {children}
    </Button>
  )
}
