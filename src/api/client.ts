// Minimal fetch client for the PATROLIQ API: token auth, JSON, error envelope, file downloads.

const RAW_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:8765/api/v1/'
export const API_BASE = RAW_BASE.endsWith('/') ? RAW_BASE : `${RAW_BASE}/`

const TOKEN_KEY = 'patroliq.token'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields?: Record<string, unknown>
  readonly retryAfter?: number

  constructor(status: number, code: string, message: string, fields?: Record<string, unknown>, retryAfter?: number) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
    this.retryAfter = retryAfter
  }
}

type Listener = () => void
const unauthorisedListeners = new Set<Listener>()

/** Token lives in sessionStorage by default; "remember this device" moves it to localStorage. */
export const tokenStore = {
  get(): string | null {
    return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY)
  },
  set(token: string, remember: boolean) {
    this.clear()
    ;(remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token)
  },
  clear() {
    sessionStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_KEY)
  },
  onUnauthorised(fn: Listener) {
    unauthorisedListeners.add(fn)
    return () => {
      unauthorisedListeners.delete(fn)
    }
  },
}

export type Query = Record<string, string | number | boolean | null | undefined>

export function buildUrl(path: string, query?: Query): string {
  const url = new URL(path.replace(/^\//, ''), API_BASE)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Query
  body?: unknown
  form?: FormData
  signal?: AbortSignal
}

async function toApiError(res: Response): Promise<ApiError> {
  let code = `http_${res.status}`
  let message = res.statusText || 'Request failed'
  let fields: Record<string, unknown> | undefined
  try {
    const data = await res.json()
    if (data?.error) {
      code = data.error.code ?? code
      message = data.error.message ?? message
      fields = data.error.fields
    } else if (typeof data?.detail === 'string') {
      message = data.detail
    }
  } catch {
    /* not JSON */
  }
  const ra = res.headers.get('retry-after')
  return new ApiError(res.status, code, message, fields, ra ? Number(ra) : undefined)
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = tokenStore.get()
  if (token) headers.Authorization = `Token ${token}`
  let body: BodyInit | undefined
  if (opts.form) body = opts.form
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  let res: Response
  try {
    res = await fetch(buildUrl(path, opts.query), { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, signal: opts.signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'network_error', 'Cannot reach the PATROLIQ server. Check your connection.')
  }
  if (res.status === 401 && token) {
    const err = await toApiError(res)
    if (['token_expired', 'invalid_token', 'not_authenticated', 'http_401'].includes(err.code)) {
      tokenStore.clear()
      unauthorisedListeners.forEach((fn) => fn())
    }
    throw err
  }
  if (!res.ok) throw await toApiError(res)
  if (res.status === 204) return undefined as T
  const type = res.headers.get('content-type') ?? ''
  return (type.includes('json') ? res.json() : res.text()) as Promise<T>
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', form }),
}

/** Authenticated file fetch (reports, CSV exports, media). Returns a Blob plus the server-suggested filename. */
export async function fetchFile(path: string, query?: Query): Promise<{ blob: Blob; filename: string }> {
  const token = tokenStore.get()
  const res = await fetch(buildUrl(path, query), { headers: token ? { Authorization: `Token ${token}` } : {} })
  if (!res.ok) throw await toApiError(res)
  const cd = res.headers.get('content-disposition') ?? ''
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)
  return { blob: await res.blob(), filename: match ? decodeURIComponent(match[1]) : 'download' }
}

/**
 * Where to fetch an API path or absolute URL, and whether the auth token may go with it.
 * The token is only ever sent to URLs under the configured API base. An absolute URL on another origin whose path is under
 * the API base path (e.g. the server built `http://` links behind a TLS proxy) is re-pointed at the configured base; any
 * other host is fetched without the token.
 */
export function resolveApiRequest(pathOrUrl: string, base: string = API_BASE): { url: string; withToken: boolean } {
  const baseUrl = new URL(base, typeof window !== 'undefined' ? window.location.href : undefined)
  const basePath = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : `${baseUrl.pathname}/`
  if (!/^[a-z][a-z\d+.-]*:/i.test(pathOrUrl)) {
    // API-relative path such as `media/<id>/file/`.
    return { url: new URL(pathOrUrl.replace(/^\//, ''), `${baseUrl.origin}${basePath}`).toString(), withToken: true }
  }
  let target: URL
  try {
    target = new URL(pathOrUrl)
  } catch {
    return { url: pathOrUrl, withToken: false }
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return { url: pathOrUrl, withToken: false }
  if (!target.pathname.startsWith(basePath)) return { url: target.toString(), withToken: false }
  if (target.origin === baseUrl.origin) return { url: target.toString(), withToken: true }
  return { url: `${baseUrl.origin}${target.pathname}${target.search}`, withToken: true }
}

/** Authenticated binary fetch (media files) by API path or absolute URL. Errors use the API envelope (`ApiError`). */
export async function fetchBlob(pathOrUrl: string, signal?: AbortSignal): Promise<Blob> {
  const { url, withToken } = resolveApiRequest(pathOrUrl)
  const token = withToken ? tokenStore.get() : null
  let res: Response
  try {
    res = await fetch(url, { headers: token ? { Authorization: `Token ${token}` } : {}, signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'network_error', 'Cannot reach the PATROLIQ server. Check your connection.')
  }
  if (!res.ok) throw await toApiError(res)
  return res.blob()
}

export async function downloadFile(path: string, query?: Query, fallbackName?: string) {
  const { blob, filename } = await fetchFile(path, query)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename === 'download' && fallbackName ? fallbackName : filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
