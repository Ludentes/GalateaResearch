import { Loader } from "lucide-react"

interface LoadingSpinnerProps {
  message?: string
  size?: "sm" | "md" | "lg"
}

export function LoadingSpinner({ message = "Loading...", size = "md" }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <Loader className={`${sizeClasses[size]} animate-spin text-primary`} />
      {message && <p className="text-muted-foreground">{message}</p>}
    </div>
  )
}
