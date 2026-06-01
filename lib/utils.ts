import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function retryAsync<T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 3000
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < retries) await new Promise<void>(r => setTimeout(r, delayMs))
    }
  }
  throw lastError
}
