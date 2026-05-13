const KEYS = {
  selectedAuthors: 'zsd:selected_authors',
  persona: 'zsd:persona',
  user: 'zsd:user'
}

export function setJSON<T>(key: keyof typeof KEYS, value: T) {
  localStorage.setItem(KEYS[key], JSON.stringify(value))
}

export function getJSON<T>(key: keyof typeof KEYS): T | null {
  const raw = localStorage.getItem(KEYS[key])
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function clearAll() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k))
}

export { KEYS }
