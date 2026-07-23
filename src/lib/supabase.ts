type QueryResult<T = any> = { data: T | null; error: Error | null }
type AuthCallback = (_event: string, session: LocalSession | null) => void

export type LocalUser = {
    id: string
    email: string | null
    username: string | null
}

export type LocalSession = {
    access_token: string
    token_type: 'bearer'
    user: LocalUser
}

type LocalProfile = {
    id: string
    email: string | null
    username: string | null
    role: 'HUMAS' | 'PERAWAT' | null
}

const API_BASE = import.meta.env?.VITE_API_BASE_URL || '/api'
const TOKEN_KEY = 'jadok.local.token'
const uploadUrlByPath = new Map<string, string>()
const authCallbacks = new Set<AuthCallback>()

export function buildApiUrl(apiBase: string, path: string) {
    const normalizedBase = apiBase.replace(/\/+$/, '') || '/api'
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    return `${normalizedBase}${normalizedPath}`
}

export async function parseApiResponse(response: Response, requestUrl: string) {
    const text = await response.text()
    if (!text) return null

    const contentType = response.headers.get('content-type') || ''
    const trimmed = text.trimStart()
    if (contentType.includes('text/html') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
        throw new Error(
            `Expected JSON from API endpoint ${requestUrl}, but received HTML (HTTP ${response.status}). ` +
            `Usually the API is down, the Vite proxy failed, or a reverse proxy rejected a large body. ` +
            `Confirm npm run dev is running both servers and the file is under 25MB.`
        )
    }

    try {
        return JSON.parse(text)
    } catch (error) {
        throw new Error(`Expected JSON from API endpoint ${requestUrl}, but received invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
}

function getToken() {
    return localStorage.getItem(TOKEN_KEY)
}

function setToken(token: string | null) {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
}

function notifyAuth(event: string, session: LocalSession | null) {
    authCallbacks.forEach((callback) => callback(event, session))
}

async function apiFetch(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers)
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (options.body && !(options.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json')
    }

    const requestUrl = buildApiUrl(API_BASE, path)
    const response = await fetch(requestUrl, { ...options, headers })
    const body = await parseApiResponse(response, requestUrl)
    if (!response.ok) {
        throw new Error(body?.error || `Request failed with ${response.status}`)
    }
    return body
}

class QueryBuilder implements PromiseLike<QueryResult> {
    private operation: 'select' | 'insert' | 'update' | 'delete' = 'select'
    private selectClause = '*'
    private filters: Record<string, string | number | boolean> = {}
    private orderBy: { column: string; ascending?: boolean } | null = null
    private payload: unknown
    private wantsSingle = false

    constructor(private table: string) { }

    select(columns = '*') {
        this.selectClause = columns
        if (this.operation === 'insert') return this
        return this
    }

    insert(values: unknown) {
        this.operation = 'insert'
        this.payload = values
        return this
    }

    update(values: unknown) {
        this.operation = 'update'
        this.payload = values
        return this
    }

    delete() {
        this.operation = 'delete'
        return this
    }

    eq(column: string, value: string | number | boolean) {
        this.filters[`eq_${column}`] = value
        return this
    }

    order(column: string, options?: { ascending?: boolean }) {
        this.orderBy = { column, ascending: options?.ascending }
        return this
    }

    single() {
        this.wantsSingle = true
        return this
    }

    async execute(): Promise<QueryResult> {
        try {
            const params = new URLSearchParams()
            params.set('select', this.selectClause)
            Object.entries(this.filters).forEach(([key, value]) => params.set(key, String(value)))
            if (this.orderBy) {
                params.set('order', this.orderBy.column)
                if (this.orderBy.ascending !== undefined) params.set('ascending', String(this.orderBy.ascending))
            }
            const qs = params.toString() ? `?${params}` : ''

            let data: any
            if (this.operation === 'select') {
                data = await apiFetch(`/${this.table}${qs}`)
            } else if (this.operation === 'insert') {
                data = await apiFetch(`/${this.table}`, { method: 'POST', body: JSON.stringify(this.payload) })
            } else if (this.operation === 'update') {
                data = await apiFetch(`/${this.table}${qs}`, { method: 'PATCH', body: JSON.stringify(this.payload) })
            } else {
                data = await apiFetch(`/${this.table}${qs}`, { method: 'DELETE' })
            }

            if (this.wantsSingle && Array.isArray(data)) data = data[0] ?? null
            return { data, error: null }
        } catch (error) {
            return { data: null, error: error instanceof Error ? error : new Error(String(error)) }
        }
    }

    then<TResult1 = QueryResult, TResult2 = never>(
        onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
        return this.execute().then(onfulfilled, onrejected)
    }
}

export const supabase = {
    from(table: string) {
        return new QueryBuilder(table)
    },

    auth: {
        async signInWithPassword({ username, email, password }: { username?: string; email?: string; password: string }) {
            try {
                const data = await apiFetch('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ username: username ?? email, password }),
                })
                setToken(data.session.access_token)
                notifyAuth('SIGNED_IN', data.session)
                return { data, error: null }
            } catch (error) {
                return { data: null, error: error instanceof Error ? error : new Error(String(error)) }
            }
        },

        async signUp({ username, email, password, options }: { username?: string; email?: string; password: string; options?: { data?: Partial<LocalProfile> } }) {
            try {
                const data = await apiFetch('/auth/signup', {
                    method: 'POST',
                    body: JSON.stringify({
                        password,
                        username: username ?? options?.data?.username ?? email,
                        role: options?.data?.role,
                    }),
                })
                return { data, error: null }
            } catch (error) {
                return { data: null, error: error instanceof Error ? error : new Error(String(error)) }
            }
        },

        async getSession() {
            const token = getToken()
            if (!token) return { data: { session: null }, error: null }
            try {
                const data = await apiFetch('/auth/session')
                return { data: { session: data.session as LocalSession }, error: null }
            } catch {
                setToken(null)
                return { data: { session: null }, error: null }
            }
        },

        onAuthStateChange(callback: AuthCallback) {
            authCallbacks.add(callback)
            return {
                data: {
                    subscription: {
                        unsubscribe: () => authCallbacks.delete(callback),
                    },
                },
            }
        },

        async signOut() {
            try {
                await apiFetch('/auth/logout', { method: 'POST' })
            } catch {
                // Local sign-out should still clear stale tokens if the server is down.
            }
            setToken(null)
            notifyAuth('SIGNED_OUT', null)
            return { error: null }
        },
    },

    storage: {
        from(_bucket: string) {
            return {
                async upload(filePath: string, file: File) {
                    try {
                        const formData = new FormData()
                        formData.append('file', file)
                        const data = await apiFetch('/uploads/templates', { method: 'POST', body: formData })
                        uploadUrlByPath.set(filePath, data.publicUrl)
                        return { data: { path: data.path }, error: null }
                    } catch (error) {
                        return { data: null, error: error instanceof Error ? error : new Error(String(error)) }
                    }
                },
                getPublicUrl(filePath: string) {
                    return { data: { publicUrl: uploadUrlByPath.get(filePath) || `/uploads/${filePath}` } }
                },
            }
        },
    },

    async rpc(name: string, params: Record<string, unknown>) {
        try {
            const data = await apiFetch(`/rpc/${name}`, { method: 'POST', body: JSON.stringify(params) })
            return { data, error: null }
        } catch (error) {
            return { data: null, error: error instanceof Error ? error : new Error(String(error)) }
        }
    },
}
