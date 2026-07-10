import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Database } from '../../types/database.types'
import { Plus, Pencil, Trash2, X, Save, AlertTriangle, Users as UsersIcon } from 'lucide-react'

type Profile = Database['public']['Tables']['profiles']['Row']

export default function Users() {
    const [users, setUsers] = useState<Profile[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<Profile | null>(null)
    const [formData, setFormData] = useState({ password: '', username: '', role: 'NURSE' as 'IT' | 'PR' | 'NURSE' })
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => { fetchUsers() }, [])

    const fetchUsers = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase.from('profiles').select('*').order('username')
            if (error) throw error
            setUsers(data || [])
        } catch (err: any) { console.error('Error fetching users:', err); setError(err.message) } finally { setLoading(false) }
    }

    const handleOpenModal = (user?: Profile) => {
        setEditingUser(user || null)
        setFormData({ password: '', username: user?.username || '', role: user?.role || 'NURSE' })
        setIsModalOpen(true); setError(null); setSuccess(null)
    }
    const handleCloseModal = () => { setIsModalOpen(false); setEditingUser(null); setFormData({ password: '', username: '', role: 'NURSE' }); setError(null); setSuccess(null) }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setError(null); setSuccess(null); setSaving(true)
        try {
            if (editingUser) {
                const { error } = await supabase.from('profiles').update({ username: formData.username.trim() || null, role: formData.role }).eq('id', editingUser.id)
                if (error) throw error
                setSuccess('User berhasil diperbarui.')
            } else {
                if (!formData.username.trim() || !formData.password) { setError('Username dan kata sandi wajib diisi untuk pengguna baru.'); return }
                const { data: authData, error: authError } = await supabase.auth.signUp({ username: formData.username.trim(), password: formData.password, options: { data: { role: formData.role } } })
                if (authError) throw authError
                if (!authData.user) throw new Error('Failed to create user.')
                setSuccess('User berhasil dibuat.')
            }
            await fetchUsers(); handleCloseModal()
        } catch (err: any) { console.error('Error saving user:', err); setError(err.message) } finally { setSaving(false) }
    }

    const handleDelete = async (id: string) => {
        if (!window.confirm('Apakah Anda yakin ingin menghapus pengguna ini? Tindakan ini akan menghapus akun login dan profil pengguna secara permanen.')) return
        try {
            // @ts-ignore
            const { error } = await supabase.rpc('delete_user_account', { user_id: id })
            if (error) throw error
            fetchUsers()
        } catch (err: any) { console.error('Error deleting user:', err); setError('Gagal menghapus pengguna. Pastikan Anda memiliki izin.') }
    }

    const roleBadge = (role: string | null) => role === 'IT' ? 'badge-purple' : role === 'PR' ? 'badge-pink' : 'badge-green'
    const roleLabel = (role: string | null) => role === 'PR' ? 'HUMAS' : role === 'NURSE' ? 'PERAWAT' : role || '-'

    return (
        <div className="page-shell">
            <section className="page-header">
                <div><span className="page-kicker">Akses pengguna</span><h1 className="page-title">Manajemen Pengguna</h1><p className="page-subtitle">Buat akun staff dan atur akses IT, PERAWAT, atau HUMAS tanpa menyentuh database langsung.</p></div>
                <button onClick={() => handleOpenModal()} className="btn btn-primary"><Plus className="mr-2 h-5 w-5" />Buat Pengguna</button>
            </section>

            <div className="alert-info"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0" /><span><strong>Catatan:</strong> Pengguna yang dibuat di sini langsung aktif. Menghapus pengguna akan menghapus akun login dan profil secara permanen.</span></div></div>
            {error && <div className="alert-error">{error}</div>}

            {loading ? <div className="panel text-center text-slate-500">Memuat...</div> : (
                <div className="table-card"><table><thead><tr><th>Username</th><th>Peran</th><th className="text-right">Aksi</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td className="font-bold text-slate-900"><span className="mr-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><UsersIcon className="h-4 w-4" /></span>{user.username || '-'}</td><td><span className={`badge ${roleBadge(user.role)}`}>{roleLabel(user.role)}</span></td><td className="text-right"><button onClick={() => handleOpenModal(user)} className="action-icon mr-2"><Pencil className="h-4 w-4" /></button><button onClick={() => handleDelete(user.id)} className="action-icon danger-icon"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>
            )}

            {isModalOpen && <div className="modal-backdrop"><div className="modal-card"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-extrabold tracking-[-0.04em]">{editingUser ? 'Edit Pengguna' : 'Buat Pengguna'}</h2><button onClick={handleCloseModal} className="action-icon"><X className="h-5 w-5" /></button></div>{error && <div className="alert-error mb-4">{error}</div>}{success && <div className="alert-success mb-4">{success}</div>}<form onSubmit={handleSubmit} className="space-y-5"><div><label className="mb-2 block text-sm font-bold text-slate-700">Username</label><input type="text" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} className="input" /></div>{!editingUser && <div><label className="mb-2 block text-sm font-bold text-slate-700">Kata Sandi</label><input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="input" required /></div>}<div><label className="mb-2 block text-sm font-bold text-slate-700">Peran</label><select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value as any })} className="input"><option value="NURSE">PERAWAT</option><option value="PR">HUMAS</option><option value="IT">Admin IT</option></select></div><div className="flex justify-end gap-3"><button type="button" onClick={handleCloseModal} className="btn btn-secondary">Batal</button><button type="submit" disabled={saving} className="btn btn-primary"><Save className="mr-2 h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan'}</button></div></form></div></div>}
        </div>
    )
}
