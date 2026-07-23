import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Database } from '../../types/database.types'
import { Plus, Pencil, Trash2, X, Save, Stethoscope } from 'lucide-react'

type Doctor = Database['public']['Tables']['doctors']['Row']
type Department = Database['public']['Tables']['departments']['Row']
type DoctorWithDept = Doctor & { departments: Department | null }

export default function Doctors() {
    const [doctors, setDoctors] = useState<DoctorWithDept[]>([])
    const [departments, setDepartments] = useState<Department[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null)
    const [formData, setFormData] = useState({ name: '', department_id: '' })
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => { fetchData() }, [])

    const fetchData = async () => {
        try {
            setLoading(true)
            const [doctorsRes, deptsRes] = await Promise.all([
                supabase.from('doctors').select('*, departments(*)').order('name'),
                supabase.from('departments').select('*').order('name')
            ])
            if (doctorsRes.error) throw doctorsRes.error
            if (deptsRes.error) throw deptsRes.error
            setDoctors(doctorsRes.data as DoctorWithDept[] || [])
            setDepartments(deptsRes.data || [])
        } catch (err: any) { console.error('Error fetching data:', err); setError(err.message) } finally { setLoading(false) }
    }

    const handleOpenModal = (doctor?: Doctor) => {
        setEditingDoctor(doctor || null)
        setFormData({ name: doctor?.name || '', department_id: doctor?.department_id?.toString() || '' })
        setIsModalOpen(true); setError(null)
    }
    const handleCloseModal = () => { setIsModalOpen(false); setEditingDoctor(null); setFormData({ name: '', department_id: '' }); setError(null) }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setError(null); setSaving(true)
        try {
            const name = formData.name.trim()
            if (!name) throw new Error('Nama dokter wajib diisi.')
            if (!formData.department_id) throw new Error('Silakan pilih poliklinik.')
            const payload = { name, department_id: parseInt(formData.department_id, 10) }
            const res = editingDoctor
                ? await supabase.from('doctors').update(payload).eq('id', editingDoctor.id)
                : await supabase.from('doctors').insert(payload)
            if (res.error) throw res.error
            await fetchData(); handleCloseModal()
        } catch (err: any) { setError(err.message) } finally { setSaving(false) }
    }

    const handleDelete = async (id: number) => {
        if (!window.confirm('Apakah Anda yakin ingin menghapus dokter ini?')) return
        try {
            const { error } = await supabase.from('doctors').delete().eq('id', id)
            if (error) throw error
            fetchData()
        } catch (err: any) { console.error('Error deleting doctor:', err); alert('Gagal menghapus dokter. Periksa apakah dokter memiliki jadwal yang ada.') }
    }

    return (
        <div className="page-shell">
            <section className="page-header">
                <div><h1 className="page-title">Manajemen Dokter</h1><p className="page-subtitle">Kelola nama dokter dan poliklinik.</p></div>
                <button onClick={() => handleOpenModal()} className="btn btn-primary"><Plus className="mr-2 h-5 w-5" />Tambah Dokter</button>
            </section>

            {loading ? <div className="panel text-center text-slate-500">Memuat...</div> : (
                <div className="table-card"><table><thead><tr><th>Nama Dokter</th><th>Poliklinik</th><th className="text-right">Aksi</th></tr></thead><tbody>
                    {doctors.map((doc) => <tr key={doc.id}><td className="font-bold text-slate-900"><span className="mr-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Stethoscope className="h-4 w-4" /></span>{doc.name}</td><td className="text-slate-500"><span className="badge badge-teal">{doc.departments?.name || '-'}</span></td><td className="text-right"><button onClick={() => handleOpenModal(doc)} className="action-icon mr-2"><Pencil className="h-4 w-4" /></button><button onClick={() => handleDelete(doc.id)} className="action-icon danger-icon"><Trash2 className="h-4 w-4" /></button></td></tr>)}
                    {doctors.length === 0 && <tr><td colSpan={3} className="text-center text-slate-500">Tidak ada dokter ditemukan.</td></tr>}
                </tbody></table></div>
            )}

            {isModalOpen && <div className="modal-backdrop"><div className="modal-card"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold">{editingDoctor ? 'Edit Dokter' : 'Tambah Dokter'}</h2><button onClick={handleCloseModal} className="action-icon"><X className="h-5 w-5" /></button></div>{error && <div className="alert-error mb-4">{error}</div>}<form onSubmit={handleSubmit} className="space-y-5"><div><label className="mb-2 block text-sm font-bold text-slate-700">Nama Dokter</label><input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input" required /></div><div><label className="mb-2 block text-sm font-bold text-slate-700">Poliklinik</label><select value={formData.department_id} onChange={(e) => setFormData({ ...formData, department_id: e.target.value })} className="input" required><option value="">Pilih Poliklinik</option>{departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}</select></div><div className="flex justify-end gap-3"><button type="button" onClick={handleCloseModal} className="btn btn-secondary">Batal</button><button type="submit" disabled={saving} className="btn btn-primary"><Save className="mr-2 h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan'}</button></div></form></div></div>}
        </div>
    )
}
