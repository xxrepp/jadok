import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Database } from '../../types/database.types'
import { Clock, CalendarDays, Stethoscope } from 'lucide-react'
import { formatLongDateID, getLocalDateISOString } from '../../utils/dateUtils'
// import CreditMark from '../../components/CreditMark'
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
            <div className="flex h-screen items-center justify-center bg-[var(--app-bg)] text-slate-600">
                <div className="rounded-xl border border-slate-200 bg-white px-6 py-5">
                    <div className="flex items-center gap-3 text-sm font-medium">
                        <BrandLogo variant="icon" className="h-8 w-8 rounded-lg" />
                        Memuat jadwal dokter...
                    </div>
                </div>
            </div>
        )
    }

    const totalDoctors = groupedSchedules.reduce((sum, group) => sum + group.schedules.length, 0)

    return (
        <div className="min-h-screen bg-[var(--app-bg)] p-4 font-sans text-slate-900 sm:p-6 lg:p-8">
            <header className="page-header sticky top-4 z-10 mx-auto max-w-7xl">
                <div className="flex items-center gap-4">
                    <BrandLogo variant="icon" className="hidden h-12 w-12 rounded-xl border border-slate-200 sm:inline-flex" />
                    <div>
                        <h1 className="page-title">Jadwal Dokter</h1>
                        <p className="page-subtitle">{formatLongDateID(getLocalDateISOString())}</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-teal-900">
                        <div className="flex items-center gap-2">
                            <Stethoscope className="h-4 w-4 text-teal-600" />
                            <span className="text-xl font-semibold">{totalDoctors}</span>
                        </div>
                        <p className="text-xs text-teal-700">Dokter</p>
                    </div>
                    <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-900">
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-blue-600" />
                            <span className="text-xl font-semibold">
                                {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':')}
                            </span>
                        </div>
                        <p className="text-xs text-blue-700">Waktu</p>
                    </div>
                </div>
            </header>

            <main className="mx-auto mt-6 max-w-7xl">
                {error ? (
                    <div className="alert-error flex min-h-[50vh] items-center justify-center text-center text-lg font-semibold">{error}</div>
                ) : groupedSchedules.length === 0 ? (
                    <div className="panel flex min-h-[55vh] flex-col items-center justify-center text-center">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                            <CalendarDays className="h-8 w-8" />
                        </div>
                        <h2 className="text-2xl font-semibold text-slate-900">Tidak ada jadwal dokter hari ini.</h2>
                        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Jadwal publik akan otomatis tampil di sini setelah staff memasukkan jadwal hari ini.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {groupedSchedules.map((group) => (
                            <div key={group.department} className="card flex h-full flex-col">
                                <div className="border-b border-teal-100 bg-teal-50 px-5 py-4">
                                    <p className="text-xs font-medium text-teal-700">Poliklinik</p>
                                    <h2 className="mt-1 truncate text-xl font-semibold text-slate-900" title={group.department}>
                                        {group.department}
                                    </h2>
                                </div>
                                <div className="flex-1 divide-y divide-slate-100 p-2">
                                    {group.schedules.map((schedule) => (
                                        <div key={schedule.id} className="rounded-lg p-4 transition-colors hover:bg-teal-50/50">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="min-w-0">
                                                    <h3 className="truncate text-base font-semibold text-slate-900" title={schedule.doctors.name}>{schedule.doctors.name}</h3>
                                                    <div className="mt-2 inline-flex items-center rounded-lg border border-teal-100 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-800">
                                                        <Clock className="mr-1.5 h-4 w-4 text-teal-600" />
                                                        {schedule.start_time.slice(0, 5)} - {schedule.end_time.slice(0, 5)}
                                                    </div>
                                                </div>
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                                                    <Stethoscope className="h-4 w-4" />
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
            {/* <CreditMark className="mx-auto mt-8 max-w-7xl pb-2" /> */}
        </div>
    )
}
