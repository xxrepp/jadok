import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

interface ProtectedRouteProps {
    allowedRoles?: ('HUMAS' | 'PERAWAT')[]
}

export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
    const { session, profile, loading, authError } = useAuth()

    if (loading) {
        return <div className="flex h-screen items-center justify-center text-slate-500">Loading...</div>
    }

    if (!session) {
        return <Navigate to="/login" replace />
    }

    if (allowedRoles) {
        if (!profile?.role) {
            return (
                <div className="p-8 text-center text-amber-700">
                    {authError || 'Profil pengguna belum tersedia. Silakan muat ulang halaman.'}
                </div>
            )
        }

        if (!allowedRoles.includes(profile.role)) {
            return <div className="p-8 text-center text-red-600">Access denied: Anda tidak memiliki izin untuk membuka halaman ini.</div>
        }
    }

    return <Outlet />
}
