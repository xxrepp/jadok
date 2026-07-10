import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Lock, User, Loader2, ArrowRight } from 'lucide-react'
import CreditMark from '../components/CreditMark'
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
        <div className="flex min-h-screen bg-transparent p-4 text-slate-900 sm:p-6 lg:p-8">
            <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border bg-white shadow-[var(--shadow-soft)] lg:grid-cols-[1fr_0.9fr]" style={{ borderColor: 'var(--border)' }}>
                <section className="hidden min-h-[620px] flex-col justify-between border-r bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-10 lg:flex" style={{ borderColor: 'var(--border)' }}>
                    <div>
                        <div className="mb-10">
                            <BrandLogo className="h-20 w-80 rounded-2xl" />
                        </div>

                        <h1 className="mt-8 max-w-xl text-5xl font-extrabold leading-tight tracking-[-0.06em] text-slate-900">
                            Kelola jadwal dokter dengan rapi dan jelas.
                        </h1>
                        <p className="mt-6 max-w-lg text-base leading-8 text-slate-500">
                            Input jadwal harian, kelola dokter, dan export desain HUMAS dari satu sistem operasional rumah sakit.
                        </p>
                        <div className="accent-strip mt-8 max-w-xs" />
                    </div>

                    <div className="rounded-3xl border bg-slate-50 p-5 text-sm leading-7 text-slate-600" style={{ borderColor: 'var(--border)' }}>
                        <p className="font-bold text-slate-900">Fokus aplikasi</p>
                        <p className="mt-2">Jadwal dokter, data poliklinik, akun staff, dan template publikasi.</p>
                    </div>
                </section>

                <section className="flex min-h-[620px] items-center justify-center p-6 sm:p-10">
                    <div className="w-full max-w-md">
                        <div className="mb-8 lg:hidden">
                            <BrandLogo className="h-20 w-72 rounded-2xl" />
                        </div>

                        <span className="page-kicker">Staff sign in</span>
                        <h2 className="text-4xl font-extrabold tracking-[-0.06em] text-slate-900">Masuk ke dashboard</h2>
                        <p className="mt-3 text-sm leading-6 text-slate-500">Gunakan username staff untuk mengakses jadwal dokter dan template HUMAS.</p>

                        {error && <div className="alert-error mt-6">{error}</div>}

                        <form onSubmit={handleLogin} className="mt-8 space-y-5">
                            <div>
                                <label className="mb-2 block text-sm font-bold text-slate-700">Username</label>
                                <div className="relative">
                                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                        <User className="h-5 w-5 text-blue-600" />
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
                                <label className="mb-2 block text-sm font-bold text-slate-700">Kata Sandi</label>
                                <div className="relative">
                                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                        <Lock className="h-5 w-5 text-blue-600" />
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
                                className="btn btn-primary w-full py-3.5"
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

                        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-3">
                            <button
                                onClick={() => navigate('/viewer')}
                                className="btn btn-secondary w-full"
                            >
                                Lihat Jadwal Dokter Publik
                            </button>
                        </div>

                        <CreditMark className="mt-6" />
                    </div>
                </section>
            </div>
        </div>
    )
}
