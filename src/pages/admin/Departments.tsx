import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Database } from '../../types/database.types'
import { Plus, Pencil, Trash2, X, Save, Building2 } from 'lucide-react'

type Department = Database['public']['Tables']['departments']['Row']

export default function Departments() {
    const [departments, setDepartments] = useState<Department[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingDept, setEditingDept] = useState<Department | null>(null)
    const [formData, setFormData] = useState({ name: '' })
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => { fetchDepartments() }, [])

    const fetchDepartments = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase.from('departments').select('*').order('name')
            if (error) throw error
            setDepartments(data || [])
        } catch (err: any) {
            console.error('Error fetching departments:', err)
            setError(err.message)
        } finally { setLoading(false) }
    }

    const handleOpenModal = (dept?: Department) => {
        setEditingDept(dept || null)
        setFormData({ name: dept?.name || '' })
        setIsModalOpen(true)
        setError(null)
    }

    const handleCloseModal = () => {
        setIsModalOpen(false)
        setEditingDept(null)
        setFormData({ name: '' })
        setError(null)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setError(null); setSaving(true)
        try {
            const name = formData.name.trim()
            if (!name) throw new Error('Nama poliklinik wajib diisi.')
            if (editingDept) {
                const { error } = await supabase.from('departments').update({ name }).eq('id', editingDept.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('departments').insert({ name })
                if (error) throw error
            }
            await fetchDepartments(); handleCloseModal()
        } catch (err: any) { setError(err.message) } finally { setSaving(false) }
    }

    const handleDelete = async (id: number) => {
        if (!window.confirm('Apakah Anda yakin ingin menghapus poliklinik ini?')) return
        try {
            const { error } = await supabase.from('departments').delete().eq('id', id)
            if (error) throw error
            fetchDepartments()
        } catch (err: any) {
            console.error('Error deleting department:', err)
            alert('Gagal menghapus poliklinik. Mungkin masih terhubung dengan dokter yang ada.')
        }
    }

    return (
        <div className="page-shell">
            <section className="page-header">
                <div>
                    <h1 className="page-title">Manajemen Poliklinik</h1>
                    <p className="page-subtitle">Kelola unit layanan poliklinik.</p>
                </div>
                <button onClick={() => handleOpenModal()} className="btn btn-primary"><Plus className="mr-2 h-5 w-5" />Tambah Poliklinik</button>
            </section>

            {loading ? <div className="panel text-center text-slate-500">Memuat...</div> : (
                <div className="table-card">
                    <table>
                        <thead><tr><th>Nama Poliklinik</th><th className="text-right">Aksi</th></tr></thead>
                        <tbody>
                            {departments.map((dept) => (
                                <tr key={dept.id}>
                                    <td className="font-bold text-slate-900"><span className="mr-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Building2 className="h-4 w-4" /></span>{dept.name}</td>
                                    <td className="text-right"><button onClick={() => handleOpenModal(dept)} className="action-icon mr-2"><Pencil className="h-4 w-4" /></button><button onClick={() => handleDelete(dept.id)} className="action-icon danger-icon"><Trash2 className="h-4 w-4" /></button></td>
                                </tr>
                            ))}
                            {departments.length === 0 && <tr><td colSpan={2} className="text-center text-slate-500">Tidak ada poliklinik ditemukan.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}

            {isModalOpen && (
                <div className="modal-backdrop">
                    <div className="modal-card">
                        <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold">{editingDept ? 'Edit Poliklinik' : 'Tambah Poliklinik'}</h2><button onClick={handleCloseModal} className="action-icon"><X className="h-5 w-5" /></button></div>
                        {error && <div className="alert-error mb-4">{error}</div>}
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div><label className="mb-2 block text-sm font-bold text-slate-700">Nama Poliklinik</label><input type="text" value={formData.name} onChange={(e) => setFormData({ name: e.target.value })} className="input" required /></div>
                            <div className="flex justify-end gap-3"><button type="button" onClick={handleCloseModal} className="btn btn-secondary">Batal</button><button type="submit" disabled={saving} className="btn btn-primary"><Save className="mr-2 h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan'}</button></div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
