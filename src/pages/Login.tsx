import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Lock, User, Loader2, ArrowRight, Calendar } from 'lucide-react'
// import CreditMark from '../components/CreditMark'
import BrandLogo from '../components/BrandLogo'

export default function Login() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const navigate = useNavigate()

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const normalizedUsername = username.trim().toLowerCase()
            if (!normalizedUsername || !password) {
                throw new Error('Username dan kata sandi wajib diisi.')
            }

            const { error: signInError } = await supabase.auth.signInWithPassword({
                username: normalizedUsername,
                password,
            })

            if (signInError) throw signInError
            navigate('/')
        } catch (err: any) {
            setError(err?.message || 'Gagal masuk. Silakan coba lagi.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] p-4">
            <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-white px-8 py-10 shadow-[var(--shadow-soft)] sm:px-10">
                <div className="mb-8 flex justify-center">
                    <BrandLogo className="h-14 w-56" />
                </div>

                <div className="mb-8 text-center">
                    <h1 className="text-2xl font-bold text-slate-900">Masuk ke dashboard</h1>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                        Gunakan username staff untuk mengakses jadwal dokter dan template HUMAS.
                    </p>
                </div>

                {error && <div className="alert-error mb-6">{error}</div>}

                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">Username</label>
                        <div className="relative">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                <User className="h-4 w-4 text-teal-600" />
                            </div>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoComplete="username"
                                className="input input-icon-left"
                                placeholder="admin"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">Kata Sandi</label>
                        <div className="relative">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                <Lock className="h-4 w-4 text-teal-600" />
                            </div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                className="input input-icon-left"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !username.trim() || !password}
                        className="btn btn-primary w-full py-3"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Masuk...
                            </>
                        ) : (
                            <>
                                Masuk
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </>
                        )}
                    </button>
                </form>

                <div className="my-6 flex items-center gap-3">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span className="text-xs text-slate-400">atau</span>
                    <div className="h-px flex-1 bg-slate-200" />
                </div>

                <button
                    type="button"
                    onClick={() => navigate('/viewer')}
                    className="btn btn-secondary w-full py-3"
                >
                    Lihat Jadwal Dokter Publik
                    <Calendar className="ml-2 h-4 w-4" />
                </button>

                {/* <CreditMark className="mt-6" /> */}
            </div>
        </div>
    )
}
