import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Database } from '../../types/database.types'
import { Calendar as CalendarIcon, Trash2, Edit, Save, X, Filter, Clock, Stethoscope } from 'lucide-react'

import { getLocalDateISOString, isValidTimeRange } from '../../utils/dateUtils'

type Schedule = Database['public']['Tables']['schedules']['Row'] & {
    doctors: { name: string; department_id: number } | null
    departments?: { name: string } | null
}
type Department = Database['public']['Tables']['departments']['Row']

export default function ScheduleList() {
    const [schedules, setSchedules] = useState<Schedule[]>([])
    const [departments, setDepartments] = useState<Department[]>([])
    const [departmentsLoaded, setDepartmentsLoaded] = useState(false)
    const [loading, setLoading] = useState(true)
    const [filterDate, setFilterDate] = useState(getLocalDateISOString())
    const [filterDept, setFilterDept] = useState<string>('')
    const [editingId, setEditingId] = useState<number | null>(null)
    const [editForm, setEditForm] = useState<{ start_time: string; end_time: string }>({ start_time: '', end_time: '' })

    useEffect(() => { fetchDepartments() }, [])
    useEffect(() => {
        if (!departmentsLoaded) return
        void fetchSchedules()
    }, [filterDate, filterDept, departmentsLoaded, departments])

    const fetchDepartments = async () => {
        try {
            const { data } = await supabase.from('departments').select('*').order('name')
            setDepartments(data || [])
        } finally {
            setDepartmentsLoaded(true)
        }
    }
    const fetchSchedules = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase.from('schedules').select(`*, doctors (name, department_id)`).eq('date', filterDate).order('start_time')
            if (error) throw error
            const rows = (data as any[]) || []
            const deptById = new Map(departments.map((d) => [d.id, d]))
            const schedulesWithDepts = rows.map((s) => ({ ...s, departments: deptById.get(s.doctors?.department_id) }))
            setSchedules(filterDept ? schedulesWithDepts.filter(s => s.doctors?.department_id === parseInt(filterDept)) : schedulesWithDepts)
        } catch (err) { console.error('Error fetching schedules:', err) } finally { setLoading(false) }
    }
    const handleDelete = async (id: number) => { if (!confirm('Apakah Anda yakin ingin menghapus jadwal ini?')) return; try { const { error } = await supabase.from('schedules').delete().eq('id', id); if (error) throw error; setSchedules(schedules.filter(s => s.id !== id)) } catch (err) { console.error('Error deleting schedule:', err); alert('Gagal menghapus jadwal') } }
    const startEdit = (schedule: Schedule) => { setEditingId(schedule.id); setEditForm({ start_time: schedule.start_time, end_time: schedule.end_time }) }
    const cancelEdit = () => setEditingId(null)
    const saveEdit = async (id: number) => {
        try {
            if (!isValidTimeRange(editForm.start_time, editForm.end_time)) { alert('Jam selesai harus lebih besar dari jam mulai.'); return }
            const { error } = await supabase.from('schedules').update(editForm).eq('id', id)
            if (error) throw error
            setSchedules(schedules.map(s => s.id === id ? { ...s, ...editForm } : s)); setEditingId(null)
        } catch (err) { console.error('Error updating schedule:', err); alert('Gagal memperbarui jadwal') }
    }

    return (
        <div className="page-shell max-w-7xl">
            <section className="page-header">
                <div><h1 className="page-title">Manajemen Jadwal</h1><p className="page-subtitle">Pantau jadwal berdasarkan tanggal dan poliklinik, lalu koreksi jam praktik jika ada perubahan.</p></div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative"><CalendarIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-600" /><input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="input input-icon-left py-2" /></div>
                    <div className="relative"><Filter className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-600" /><select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="input input-icon-left py-2"><option value="">Semua Poliklinik</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                </div>
            </section>

            {loading ? <div className="panel text-center text-slate-500">Memuat jadwal...</div> : (
                <div className="table-card"><table><thead><tr><th>Dokter</th><th>Poliklinik</th><th>Waktu</th><th className="text-right">Aksi</th></tr></thead><tbody>{schedules.map((schedule) => <tr key={schedule.id}><td className="font-bold text-slate-900"><span className="mr-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Stethoscope className="h-4 w-4" /></span>{schedule.doctors?.name}</td><td><span className="badge badge-teal">{schedule.departments?.name || '-'}</span></td><td>{editingId === schedule.id ? <div className="flex items-center gap-2"><input type="time" value={editForm.start_time} onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })} className="input w-32 py-2 text-xs" /><span>-</span><input type="time" value={editForm.end_time} onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })} className="input w-32 py-2 text-xs" /></div> : <span className="inline-flex items-center font-bold text-slate-700"><Clock className="mr-2 h-4 w-4 text-teal-600" />{schedule.start_time.slice(0, 5)} - {schedule.end_time.slice(0, 5)}</span>}</td><td className="text-right">{editingId === schedule.id ? <><button onClick={() => saveEdit(schedule.id)} className="action-icon mr-2 hover:border-emerald-100 hover:bg-emerald-50 hover:text-emerald-700"><Save className="h-4 w-4" /></button><button onClick={cancelEdit} className="action-icon"><X className="h-4 w-4" /></button></> : <><button onClick={() => startEdit(schedule)} className="action-icon mr-2"><Edit className="h-4 w-4" /></button><button onClick={() => handleDelete(schedule.id)} className="action-icon danger-icon"><Trash2 className="h-4 w-4" /></button></>}</td></tr>)}{schedules.length === 0 && <tr><td colSpan={4} className="py-12 text-center text-slate-500">Tidak ada jadwal ditemukan untuk tanggal ini.</td></tr>}</tbody></table></div>
            )}
        </div>
    )
}
