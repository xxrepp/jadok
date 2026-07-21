import React from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
    Users,
    Building2,
    Stethoscope,
    Calendar,
    LogOut,
    Menu,
    X,
    FileImage
} from 'lucide-react'
// import CreditMark from './CreditMark'
import BrandLogo from './BrandLogo'

const displayRole = (role?: string | null) => {
    if (role === 'PR') return 'HUMAS'
    if (role === 'NURSE') return 'PERAWAT'
    return role || '-'
}

export default function Layout() {
    const { user, profile, signOut } = useAuth()
    const location = useLocation()
    const navigate = useNavigate()
    const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)

    const handleSignOut = async () => {
        await signOut()
        navigate('/login')
    }

    React.useEffect(() => {
        setIsMobileMenuOpen(false)
    }, [location.pathname])

    const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`)

    const NavItem = ({ to, icon: Icon, label, helper }: { to: string; icon: any; label: string; helper?: string }) => (
        <NavLink
            to={to}
            className={`group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition-colors ${isActive(to)
                ? 'bg-white text-blue-800 shadow-sm ring-1 ring-blue-100'
                : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'
                }`}
            aria-current={isActive(to) ? 'page' : undefined}
        >
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${isActive(to)
                ? 'bg-blue-50 text-blue-700'
                : 'bg-white/80 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600'
                }`}>
                <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
                <span className="block truncate">{label}</span>
                {helper && <span className="block truncate text-[11px] font-medium text-slate-400">{helper}</span>}
            </span>
        </NavLink>
    )

    return (
        <div className="flex h-screen overflow-hidden bg-[var(--app-bg)]">
            <aside
                className={`fixed inset-y-0 left-0 z-50 w-72 transform border-r border-blue-100/80 bg-[#f4f9fb] transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                <div className="flex h-full flex-col p-4">
                    <div className="mb-5 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                        <BrandLogo className="h-14 w-full max-w-[220px]" />
                    </div>

                    <nav className="flex-1 overflow-y-auto px-1 py-1">
                        <div className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                            Operasional
                        </div>

                        {profile?.role === 'IT' && (
                            <>
                                <NavItem to="/admin/users" icon={Users} label="Pengguna" helper="Akun & peran" />
                                <NavItem to="/admin/departments" icon={Building2} label="Poliklinik" helper="Unit layanan" />
                                <NavItem to="/admin/doctors" icon={Stethoscope} label="Dokter" helper="Direktori dokter" />
                            </>
                        )}

                        {(profile?.role === 'NURSE' || profile?.role === 'IT') && (
                            <NavItem to="/nurse/schedule" icon={Calendar} label="Input Jadwal" helper="Untuk PERAWAT" />
                        )}

                        {(profile?.role === 'PR' || profile?.role === 'IT') && (
                            <NavItem to="/pr" icon={FileImage} label="Template HUMAS" helper="Poster & export PNG" />
                        )}

                        <div className="mb-2 mt-5 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                            Monitoring
                        </div>
                        <NavItem to="/schedules" icon={Calendar} label="Semua Jadwal" helper="Review dan koreksi" />
                    </nav>

                    <div className="mt-4 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-sm font-bold text-white">
                                {profile?.username?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || 'U'}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-slate-900">{profile?.username || 'User'}</p>
                                <p className="text-xs font-semibold text-blue-600">{displayRole(profile?.role)}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleSignOut}
                            className="btn btn-secondary w-full"
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            Keluar
                        </button>
                    </div>
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
                    <div className="flex items-center">
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="rounded-lg p-2 text-slate-600 hover:bg-blue-50 hover:text-blue-700 focus:outline-none"
                        >
                            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                        </button>
                        <BrandLogo variant="icon" className="h-9 w-9 rounded-lg border border-blue-100" />
                        <span className="ml-3 text-lg font-bold text-slate-900">JADOK</span>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
                    <Outlet />
                    {/* <CreditMark className="mt-8 pb-2" /> */}
                </main>
            </div>

            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}
        </div>
    )
}
