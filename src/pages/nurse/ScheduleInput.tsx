import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Database } from '../../types/database.types'
import { Save, Calendar as CalendarIcon, Clock, Building2, Stethoscope, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

import { getLocalDateISOString, isValidTimeRange } from '../../utils/dateUtils'

type Department = Database['public']['Tables']['departments']['Row']
type Doctor = Database['public']['Tables']['doctors']['Row']

export default function ScheduleInput() {
    const { user } = useAuth()
    const [departments, setDepartments] = useState<Department[]>([])
    const [doctors, setDoctors] = useState<Doctor[]>([])
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const [selectedDate, setSelectedDate] = useState(getLocalDateISOString())
    const [selectedDeptId, setSelectedDeptId] = useState<string>('')
    const [selectedDoctorId, setSelectedDoctorId] = useState<string>('')
    const [startTime, setStartTime] = useState('08:00')
    const [endTime, setEndTime] = useState('16:00')

    useEffect(() => {
        fetchDepartments()
    }, [])

    useEffect(() => {
        if (selectedDeptId) {
            fetchDoctors(parseInt(selectedDeptId))
        } else {
            setDoctors([])
            setSelectedDoctorId('')
        }
    }, [selectedDeptId])

    const fetchDepartments = async () => {
        try {
            const { data, error } = await supabase
                .from('departments')
                .select('*')
                .order('name')
            if (error) throw error
            setDepartments(data || [])
        } catch (err: any) {
            console.error('Error fetching departments:', err)
        }
    }

    const fetchDoctors = async (deptId: number) => {
        try {
            const { data, error } = await supabase
                .from('doctors')
                .select('*')
                .eq('department_id', deptId)
                .order('name')
            if (error) throw error
            setDoctors(data || [])
        } catch (err: any) {
            console.error('Error fetching doctors:', err)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSuccess(null)
        setLoading(true)

        try {
            if (!selectedDoctorId || !selectedDate || !startTime || !endTime) {
                throw new Error('Please fill in all fields')
            }
            if (!isValidTimeRange(startTime, endTime)) {
                throw new Error('Jam selesai harus lebih besar dari jam mulai.')
            }

            const { error } = await supabase
                .from('schedules')
                .insert({
                    doctor_id: parseInt(selectedDoctorId),
                    date: selectedDate,
                    start_time: startTime,
                    end_time: endTime,
                    created_by: user?.id
                })

            if (error) throw error

            setSuccess('Jadwal berhasil disimpan!')
            setSelectedDoctorId('')
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const selectedDepartment = departments.find((dept) => dept.id.toString() === selectedDeptId)
    const selectedDoctor = doctors.find((doc) => doc.id.toString() === selectedDoctorId)

    return (
        <div className="page-shell max-w-5xl">
            <section className="page-header">
                <div>
                    <span className="page-kicker">Alur PERAWAT</span>
                    <h1 className="page-title">Input Jadwal Dokter</h1>
                    <p className="page-subtitle">Pilih poliklinik, dokter, dan jam praktik. Form dibuat step-by-step agar input harian cepat dan minim salah.</p>
                </div>
                <div className="hidden rounded-3xl border border-teal-100 bg-teal-50/80 p-4 text-teal-800 sm:block">
                    <CalendarIcon className="mb-2 h-6 w-6" />
                    <p className="text-sm font-extrabold">{selectedDate}</p>
                    <p className="text-xs font-semibold text-teal-600">Tanggal jadwal</p>
                </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <section className="card p-6 sm:p-8">
                    {error && <div className="alert-error mb-6">{error}</div>}
                    {success && <div className="alert-success mb-6 flex items-center gap-2"><CheckCircle2 className="h-5 w-5" />{success}</div>}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="mb-2 block text-sm font-bold text-slate-700">Tanggal</label>
                            <div className="relative">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                    <CalendarIcon className="h-5 w-5 text-teal-600" />
                                </div>
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="input input-icon-left"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid gap-5 sm:grid-cols-2">
                            <div>
                                <label className="mb-2 block text-sm font-bold text-slate-700">1. Poliklinik</label>
                                <div className="relative">
                                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                        <Building2 className="h-5 w-5 text-teal-600" />
                                    </div>
                                    <select
                                        value={selectedDeptId}
                                        onChange={(e) => setSelectedDeptId(e.target.value)}
                                        className="input input-icon-left"
                                        required
                                    >
                                        <option value="">Pilih Poliklinik</option>
                                        {departments.map(dept => (
                                            <option key={dept.id} value={dept.id}>{dept.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-bold text-slate-700">2. Dokter</label>
                                <div className="relative">
                                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                        <Stethoscope className="h-5 w-5 text-teal-600" />
                                    </div>
                                    <select
                                        value={selectedDoctorId}
                                        onChange={(e) => setSelectedDoctorId(e.target.value)}
                                        className="input input-icon-left"
                                        required
                                        disabled={!selectedDeptId}
                                    >
                                        <option value="">{selectedDeptId ? 'Pilih Dokter' : 'Pilih Poliklinik Terlebih Dahulu'}</option>
                                        {doctors.map(doc => (
                                            <option key={doc.id} value={doc.id}>{doc.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="mb-2 block text-sm font-bold text-slate-700">Jam Mulai</label>
                                <div className="relative">
                                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                        <Clock className="h-5 w-5 text-teal-600" />
                                    </div>
                                    <input
                                        type="time"
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                        className="input input-icon-left"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-bold text-slate-700">Jam Selesai</label>
                                <div className="relative">
                                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                        <Clock className="h-5 w-5 text-teal-600" />
                                    </div>
                                    <input
                                        type="time"
                                        value={endTime}
                                        onChange={(e) => setEndTime(e.target.value)}
                                        className="input input-icon-left"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn btn-primary w-full py-3.5"
                        >
                            <Save className="mr-2 h-5 w-5" />
                            {loading ? 'Menyimpan...' : 'Simpan Jadwal'}
                        </button>
                    </form>
                </section>

                <aside className="panel h-fit">
                    <span className="page-kicker">Preview</span>
                    <h2 className="mt-2 text-xl font-extrabold tracking-[-0.04em] text-slate-900">Ringkasan Jadwal</h2>
                    <div className="mt-5 space-y-3">
                        <div className="rounded-3xl border border-teal-100 bg-teal-50/70 p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Poliklinik</p>
                            <p className="mt-1 font-extrabold text-slate-900">{selectedDepartment?.name || 'Belum dipilih'}</p>
                        </div>
                        <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Dokter</p>
                            <p className="mt-1 font-extrabold text-slate-900">{selectedDoctor?.name || 'Belum dipilih'}</p>
                        </div>
                        <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Waktu</p>
                            <p className="mt-1 font-extrabold text-slate-900">{startTime} - {endTime}</p>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    )
}
