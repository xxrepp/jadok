import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

import Departments from './pages/admin/Departments'
import Doctors from './pages/admin/Doctors'
import AdminUsers from './pages/admin/Users'
import ExportSchedule from './pages/admin/ExportSchedule'

import ScheduleInput from './pages/nurse/ScheduleInput'

// Template module is dormant (kept for possible future use).
// import Templates from './pages/pr/Templates'
// import TemplateEditor from './pages/pr/TemplateEditor'
import ScheduleList from './pages/shared/ScheduleList'
import { Users as UsersIcon, Stethoscope, Building2, Calendar, Download, ArrowRight } from 'lucide-react'

import Viewer from './pages/public/Viewer'

function DashboardHome() {
    const { profile } = useAuth()
    const isHumas = profile?.role === 'HUMAS'
    const canInputSchedule = isHumas || profile?.role === 'PERAWAT'
    const cards = [
        { label: 'Pengguna', description: 'Kelola akun staff dan akses aplikasi.', path: '/admin/users', show: isHumas, icon: UsersIcon },
        { label: 'Poliklinik', description: 'Daftar unit poliklinik untuk pengelompokan jadwal.', path: '/admin/departments', show: isHumas, icon: Building2 },
        { label: 'Dokter', description: 'Daftar dokter dan relasi ke poliklinik.', path: '/admin/doctors', show: isHumas, icon: Stethoscope },
        { label: 'Ekspor Jadwal', description: 'Pratinjau dan ekspor jadwal dokter hari ini.', path: '/admin/export-schedule', show: isHumas, icon: Download },
        { label: 'Input Jadwal', description: 'Masukkan jadwal praktik dokter.', path: '/nurse/schedule', show: canInputSchedule, icon: Calendar },
        { label: 'Semua Jadwal', description: 'Pantau, edit, dan validasi jadwal aktif.', path: '/schedules', show: true, icon: Calendar },
    ].filter((card) => card.show)

    return (
        <div className="page-shell">
            <section className="page-header">
                <div>
                    <h1 className="page-title">Dashboard Jadwal Dokter</h1>
                    <p className="page-subtitle">
                        Pilih menu kerja untuk mengelola jadwal, data dokter, dan pengguna.
                    </p>
                </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map((card) => {
                    const Icon = card.icon
                    return (
                        <Link key={card.path} to={card.path} className="group card p-5 transition-colors hover:bg-teal-50/40">
                            <div className="flex items-start justify-between gap-4">
                                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-teal-100 bg-teal-50 text-teal-700">
                                    <Icon className="h-5 w-5" />
                                </span>
                                <span className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400 transition group-hover:border-teal-100 group-hover:text-teal-700">
                                    <ArrowRight className="h-4 w-4" />
                                </span>
                            </div>
                            <h2 className="mt-4 text-lg font-semibold text-slate-900">{card.label}</h2>
                            <p className="mt-1 text-sm leading-6 text-slate-500">{card.description}</p>
                        </Link>
                    )
                })}
            </section>
        </div>
    )
}

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/viewer" element={<Viewer />} />
                    <Route path="/login" element={<Login />} />

                    <Route element={<ProtectedRoute />}>
                        <Route element={<Layout />}>
                            <Route path="/" element={<Navigate to="/dashboard" replace />} />

                            <Route element={<ProtectedRoute allowedRoles={['HUMAS']} />}>
                                <Route path="/admin" element={<DashboardHome />} />
                                <Route path="/admin/users" element={<AdminUsers />} />
                                <Route path="/admin/departments" element={<Departments />} />
                                <Route path="/admin/doctors" element={<Doctors />} />
                                <Route path="/admin/export-schedule" element={<ExportSchedule />} />
                            </Route>

                            <Route element={<ProtectedRoute allowedRoles={['PERAWAT', 'HUMAS']} />}>
                                <Route path="/nurse/schedule" element={<ScheduleInput />} />
                            </Route>

                            {/* Template module is dormant (kept for possible future use).
                            <Route element={<ProtectedRoute allowedRoles={['HUMAS']} />}>
                                <Route path="/pr" element={<Templates />} />
                                <Route path="/pr/editor/:id" element={<TemplateEditor />} />
                            </Route>
                            */}

                            <Route path="/dashboard" element={<DashboardHome />} />
                            <Route path="/schedules" element={<ScheduleList />} />
                        </Route>
                    </Route>
                    <Route path="*" element={<div className="flex min-h-screen items-center justify-center p-8 text-center text-slate-500">404 - Page Not Found</div>} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    )
}

export default App
