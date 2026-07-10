import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Database } from '../../types/database.types'
import { Clock, CalendarDays, Stethoscope } from 'lucide-react'
import { formatLongDateID, getLocalDateISOString } from '../../utils/dateUtils'
import CreditMark from '../../components/CreditMark'
import BrandLogo from '../../components/BrandLogo'

type Schedule = Database['public']['Tables']['schedules']['Row'] & {
    doctors: Database['public']['Tables']['doctors']['Row'] & {
        departments: Database['public']['Tables']['departments']['Row']
    }
}

type GroupedSchedule = {
    department: string
    schedules: Schedule[]
}

export default function Viewer() {
    const [groupedSchedules, setGroupedSchedules] = useState<GroupedSchedule[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [currentTime, setCurrentTime] = useState(new Date())

    useEffect(() => {
        void fetchSchedules()
        const refreshInterval = setInterval(() => void fetchSchedules(), 300000)
        const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000)

        return () => {
            clearInterval(refreshInterval)
            clearInterval(timeInterval)
        }
    }, [])

    const fetchSchedules = async () => {
        try {
            setError(null)
            const today = getLocalDateISOString()
            const { data, error: fetchError } = await supabase
                .from('schedules')
                .select(`
                    *,
                    doctors (
                        *,
                        departments (*)
                    )
                `)
                .eq('date', today)
                .order('start_time')

            if (fetchError) throw fetchError

            const groups: Record<string, Schedule[]> = {}
            ;(data || []).forEach((schedule: any) => {
                const deptName = schedule.doctors?.departments?.name || 'General'
                if (!groups[deptName]) groups[deptName] = []
                groups[deptName].push(schedule)
            })

            const grouped = Object.keys(groups)
                .map((department) => ({
                    department,
                    schedules: groups[department],
                }))
                .sort((a, b) => a.department.localeCompare(b.department))

            setGroupedSchedules(grouped)
        } catch (err) {
            console.error('Error fetching schedules:', err)
            setError('Gagal memuat jadwal dokter.')
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-transparent text-blue-700">
                <div className="rounded-3xl border border-blue-100 bg-white px-6 py-5 shadow-[var(--shadow-card)]">
                    <div className="flex items-center gap-3 text-sm font-bold">
                        <BrandLogo variant="icon" className="h-8 w-8 rounded-xl" />
                        Memuat jadwal dokter...
                    </div>
                </div>
            </div>
        )
    }

    const totalDoctors = groupedSchedules.reduce((sum, group) => sum + group.schedules.length, 0)

    return (
        <div className="min-h-screen bg-transparent p-4 font-sans text-slate-900 sm:p-6 lg:p-8">
            <header className="page-header sticky top-4 z-10 mx-auto max-w-7xl">
                <div className="flex items-center gap-4">
                    <BrandLogo variant="icon" className="hidden h-16 w-16 rounded-3xl border border-blue-100 sm:inline-flex" />
                    <div>
                        <span className="page-kicker">Jadwal hari ini</span>
                        <h1 className="page-title">Jadwal Dokter</h1>
                        <p className="page-subtitle">{formatLongDateID(getLocalDateISOString())}</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="rounded-3xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-blue-800">
                        <div className="flex items-center gap-2">
                            <Stethoscope className="h-5 w-5" />
                            <span className="text-2xl font-extrabold tracking-[-0.04em]">{totalDoctors}</span>
                        </div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em]">Dokter</p>
                    </div>
                    <div className="rounded-3xl border border-teal-100 bg-teal-50 px-4 py-3 text-teal-800">
                        <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5" />
                            <span className="text-2xl font-extrabold tracking-[-0.04em]">
                                {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':')}
                            </span>
                        </div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em]">Waktu</p>
                    </div>
                </div>
            </header>

            <main className="mx-auto mt-6 max-w-7xl">
                {error ? (
                    <div className="alert-error flex min-h-[50vh] items-center justify-center text-center text-lg font-bold">{error}</div>
                ) : groupedSchedules.length === 0 ? (
                    <div className="panel flex min-h-[55vh] flex-col items-center justify-center text-center">
                        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-teal-50 text-teal-700">
                            <CalendarDays className="h-10 w-10" />
                        </div>
                        <h2 className="text-3xl font-extrabold tracking-[-0.05em] text-slate-900">Tidak ada jadwal dokter hari ini.</h2>
                        <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">Jadwal publik akan otomatis tampil di sini setelah staff memasukkan jadwal hari ini.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {groupedSchedules.map((group) => (
                            <div key={group.department} className="card flex h-full flex-col transition-colors hover:border-blue-200">
                                <div className="border-b bg-blue-50/55 px-6 py-5" style={{ borderColor: 'var(--border)' }}>
                                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Poliklinik</p>
                                    <h2 className="mt-2 truncate text-2xl font-extrabold tracking-[-0.05em] text-slate-900" title={group.department}>
                                        {group.department}
                                    </h2>
                                </div>
                                <div className="flex-1 divide-y divide-slate-100 p-2">
                                    {group.schedules.map((schedule) => (
                                        <div key={schedule.id} className="rounded-2xl p-4 transition-colors hover:bg-blue-50/45">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="min-w-0">
                                                    <h3 className="truncate text-lg font-extrabold tracking-[-0.03em] text-slate-900" title={schedule.doctors.name}>{schedule.doctors.name}</h3>
                                                    <div className="mt-2 inline-flex items-center rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-sm font-bold text-teal-800">
                                                        <Clock className="mr-1.5 h-4 w-4" />
                                                        {schedule.start_time.slice(0, 5)} - {schedule.end_time.slice(0, 5)}
                                                    </div>
                                                </div>
                                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                                                    <Stethoscope className="h-5 w-5" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
            <CreditMark className="mx-auto mt-8 max-w-7xl pb-2" />
        </div>
    )
}
