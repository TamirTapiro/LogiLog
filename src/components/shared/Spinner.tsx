import { useState, useEffect } from 'react'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

interface SpinnerProps {
  interval?: number
}

export function Spinner({ interval = 100 }: SpinnerProps) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length)
    }, interval)
    return () => clearInterval(id)
  }, [interval])

  return <span aria-label="Loading">{FRAMES[frame]}</span>
}
