import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Database } from '../../types/database.types'
import { CalendarDays, Clock, Download, Stethoscope, X } from 'lucide-react'
import { formatLongDateID, getLocalDateISOString } from '../../utils/dateUtils'
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

type DensityMode = 'comfortable' | 'compact' | 'dense'

type DensityMetrics = {
    deptHeaderH: number
    rowH: number
    cardPad: number
    cardGap: number
    deptTitleFont: number
    doctorFont: number
    timeFont: number
    columns: number
}

const STORY_WIDTH = 1080
const STORY_HEIGHT = 1920
const LOGO_SRC = '/assets/jadok%20small%20logo.png'

const C = {
    bgTop: '#0d9488',
    bgTopDeep: '#0f766e',
    bgBottom: '#eef6f5',
    surface: '#ffffff',
    surfaceSoft: '#f0fdfa',
    primarySoft: '#ccfbf1',
    text: '#0f172a',
    muted: '#64748b',
    border: '#d5e5e3',
    accent: '#0f766e',
}

const HERO_BOTTOM = 300
const SHEET_INSET = 48
const SHEET_TOP = 300
const SHEET_BOTTOM_PAD = 64
const SHEET_RADIUS = 36
const SHEET_INNER_PAD = 28

function pickDensityMode(totalDoctors: number, deptCount: number): DensityMode {
    if (totalDoctors <= 10 && deptCount <= 6) return 'comfortable'
    if (totalDoctors <= 18 && deptCount <= 10) return 'compact'
    return 'dense'
}

function baseMetrics(mode: DensityMode, deptCount: number): DensityMetrics {
    if (mode === 'comfortable') {
        return {
            deptHeaderH: 64,
            rowH: 56,
            cardPad: 24,
            cardGap: 20,
            deptTitleFont: 32,
            doctorFont: 28,
            timeFont: 22,
            columns: 1,
        }
    }
    if (mode === 'compact') {
        return {
            deptHeaderH: 52,
            rowH: 44,
            cardPad: 18,
            cardGap: 14,
            deptTitleFont: 28,
            doctorFont: 24,
            timeFont: 20,
            columns: 1,
        }
    }
    return {
        deptHeaderH: 44,
        rowH: 36,
        cardPad: 14,
        cardGap: 10,
        deptTitleFont: 24,
        doctorFont: 20,
        timeFont: 18,
        columns: deptCount >= 4 ? 2 : 1,
    }
}

function scaleMetrics(m: DensityMetrics, s: number): DensityMetrics {
    return {
        deptHeaderH: m.deptHeaderH * s,
        rowH: m.rowH * s,
        cardPad: m.cardPad * s,
        cardGap: m.cardGap * s,
        deptTitleFont: m.deptTitleFont * s,
        doctorFont: m.doctorFont * s,
        timeFont: m.timeFont * s,
        columns: m.columns,
    }
}

function cardHeight(schedulesLen: number, m: DensityMetrics): number {
    return m.cardPad + m.deptHeaderH + schedulesLen * m.rowH + m.cardPad
}

function estimateContentHeight(groups: GroupedSchedule[], m: DensityMetrics): number {
    if (groups.length === 0) return 180
    if (m.columns === 1) {
        let h = 0
        for (const group of groups) {
            h += cardHeight(group.schedules.length, m) + m.cardGap
        }
        return h - m.cardGap
    }

    const colH = [0, 0]
    for (const group of groups) {
        const h = cardHeight(group.schedules.length, m)
        const idx = colH[0] <= colH[1] ? 0 : 1
        colH[idx] += h + m.cardGap
    }
    return Math.max(colH[0], colH[1]) - m.cardGap
}

function loadLogo(): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = LOGO_SRC
    })
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
) {
    const radius = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.arcTo(x + w, y, x + w, y + h, radius)
    ctx.arcTo(x + w, y + h, x, y + h, radius)
    ctx.arcTo(x, y + h, x, y, radius)
    ctx.arcTo(x, y, x + w, y, radius)
    ctx.closePath()
}

function fillRoundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill: string,
) {
    roundRect(ctx, x, y, w, h, r)
    ctx.fillStyle = fill
    ctx.fill()
}

function strokeRoundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    stroke: string,
    lineWidth = 2,
) {
    roundRect(ctx, x, y, w, h, r)
    ctx.strokeStyle = stroke
    ctx.lineWidth = lineWidth
    ctx.stroke()
}

function drawTruncatedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
) {
    if (ctx.measureText(text).width <= maxWidth) {
        ctx.fillText(text, x, y)
        return
    }
    let lo = 0
    let hi = text.length
    let best = ''
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        const candidate = `${text.slice(0, mid)}…`
        if (ctx.measureText(candidate).width <= maxWidth) {
            best = candidate
            lo = mid + 1
        } else {
            hi = mid - 1
        }
    }
    ctx.fillText(best || '…', x, y)
}

export default function ExportSchedule() {
    const [exportDate, setExportDate] = useState(getLocalDateISOString())
    const [groupedSchedules, setGroupedSchedules] = useState<GroupedSchedule[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [exporting, setExporting] = useState(false)
    const [exportError, setExportError] = useState<string | null>(null)
    const [previewOpen, setPreviewOpen] = useState(false)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [previewing, setPreviewing] = useState(false)
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        void fetchSchedules()
    }, [exportDate])

    useEffect(() => {
        setPreviewOpen(false)
        setPreviewUrl(null)
    }, [exportDate])

    const fetchSchedules = async () => {
        try {
            setLoading(true)
            setError(null)
            const { data, error: fetchError } = await supabase
                .from('schedules')
                .select(`*, doctors (*, departments (*))`)
                .eq('date', exportDate)
                .order('start_time')

            if (fetchError) throw fetchError

            const groups: Record<string, Schedule[]> = {}
            const rows = (data ?? []) as Schedule[]
            for (const schedule of rows) {
                const deptName = schedule.doctors?.departments?.name || 'General'
                if (!groups[deptName]) groups[deptName] = []
                groups[deptName].push(schedule)
            }

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
            setGroupedSchedules([])
        } finally {
            setLoading(false)
        }
    }

    const totalDoctors = groupedSchedules.reduce((sum, group) => sum + group.schedules.length, 0)

    const paintStoryCanvas = (
        ctx: CanvasRenderingContext2D,
        logo: HTMLImageElement | null,
    ) => {
        const deptCount = groupedSchedules.length
        const mode = pickDensityMode(totalDoctors, deptCount)
        let metrics = baseMetrics(mode, deptCount)

        const sheetX = SHEET_INSET
        const sheetY = SHEET_TOP
        const sheetW = STORY_WIDTH - SHEET_INSET * 2
        const sheetH = STORY_HEIGHT - SHEET_TOP - SHEET_BOTTOM_PAD
        const contentW = sheetW - SHEET_INNER_PAD * 2
        const contentInnerH = sheetH - SHEET_INNER_PAD * 2

        let scale = 1
        const estimated = estimateContentHeight(groupedSchedules, metrics)
        if (estimated > contentInnerH) {
            scale = Math.max(0.72, contentInnerH / estimated)
        }
        metrics = scaleMetrics(metrics, scale)

        // 1. Vertical gradient background
        const bg = ctx.createLinearGradient(0, 0, 0, STORY_HEIGHT)
        bg.addColorStop(0, C.bgTop)
        bg.addColorStop(0.22, C.bgTopDeep)
        bg.addColorStop(0.38, C.bgBottom)
        bg.addColorStop(1, C.bgBottom)
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT)

        // Soft hero glow
        const heroGlow = ctx.createRadialGradient(
            STORY_WIDTH / 2,
            140,
            40,
            STORY_WIDTH / 2,
            160,
            420,
        )
        heroGlow.addColorStop(0, 'rgba(255,255,255,0.18)')
        heroGlow.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = heroGlow
        ctx.fillRect(0, 0, STORY_WIDTH, HERO_BOTTOM)

        // 2. Hero band
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'

        if (logo) {
            const box = 88
            const boxX = (STORY_WIDTH - box) / 2
            const boxY = 56
            fillRoundRect(ctx, boxX, boxY, box, box, 20, C.surface)
            const pad = 10
            ctx.drawImage(logo, boxX + pad, boxY + pad, box - pad * 2, box - pad * 2)
        }

        const titleY = logo ? 160 : 88
        ctx.fillStyle = C.surface
        ctx.font = 'bold 56px Inter, system-ui, sans-serif'
        ctx.fillText('Jadwal Dokter', STORY_WIDTH / 2, titleY)

        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.font = '28px Inter, system-ui, sans-serif'
        ctx.fillText(formatLongDateID(exportDate), STORY_WIDTH / 2, titleY + 72)

        const chipLabel =
            deptCount > 0
                ? `${totalDoctors} dokter · ${deptCount} poliklinik`
                : `${totalDoctors} dokter`
        ctx.font = 'bold 22px Inter, system-ui, sans-serif'
        const chipPadX = 22
        const chipW = Math.min(contentW, ctx.measureText(chipLabel).width + chipPadX * 2)
        const chipH = 40
        const chipX = (STORY_WIDTH - chipW) / 2
        const chipY = titleY + 118
        fillRoundRect(ctx, chipX, chipY, chipW, chipH, 20, C.primarySoft)
        ctx.fillStyle = C.accent
        ctx.textBaseline = 'middle'
        ctx.fillText(chipLabel, STORY_WIDTH / 2, chipY + chipH / 2)
        ctx.textBaseline = 'top'

        // 3. Content sheet
        fillRoundRect(ctx, sheetX, sheetY, sheetW, sheetH, SHEET_RADIUS, C.surface)
        strokeRoundRect(ctx, sheetX, sheetY, sheetW, sheetH, SHEET_RADIUS, C.border, 2)

        const contentX = sheetX + SHEET_INNER_PAD
        const contentY = sheetY + SHEET_INNER_PAD

        const paintCard = (group: GroupedSchedule, x: number, y: number, w: number) => {
            const h = cardHeight(group.schedules.length, metrics)
            const r = 20 * Math.min(1, scale)

            fillRoundRect(ctx, x, y, w, h, r, C.surface)
            strokeRoundRect(ctx, x, y, w, h, r, C.border, 2)

            // Teal left accent
            ctx.save()
            roundRect(ctx, x, y, w, h, r)
            ctx.clip()
            ctx.fillStyle = C.accent
            ctx.fillRect(x, y, 8, h)
            // Soft header strip
            ctx.fillStyle = C.surfaceSoft
            ctx.fillRect(x + 8, y, w - 8, metrics.deptHeaderH)
            ctx.restore()

            ctx.textAlign = 'left'
            ctx.textBaseline = 'top'
            ctx.fillStyle = C.muted
            ctx.font = `bold ${Math.max(14, Math.round(metrics.deptTitleFont * 0.55))}px Inter, system-ui, sans-serif`
            ctx.fillText('POLIKLINIK', x + metrics.cardPad + 4, y + metrics.cardPad * 0.35)

            ctx.fillStyle = C.text
            ctx.font = `bold ${Math.round(metrics.deptTitleFont)}px Inter, system-ui, sans-serif`
            drawTruncatedText(
                ctx,
                group.department,
                x + metrics.cardPad + 4,
                y + metrics.cardPad * 0.35 + Math.round(metrics.deptTitleFont * 0.85),
                w - metrics.cardPad * 2 - 8,
            )

            let rowY = y + metrics.cardPad + metrics.deptHeaderH
            for (const schedule of group.schedules) {
                const doctorName = schedule.doctors?.name || '-'
                const start = (schedule.start_time || '').slice(0, 5)
                const end = (schedule.end_time || '').slice(0, 5)
                const timeLabel = `${start} - ${end}`

                ctx.font = `bold ${Math.round(metrics.timeFont)}px Inter, system-ui, sans-serif`
                const timeW = ctx.measureText(timeLabel).width + 28
                const pillH = Math.max(26, metrics.rowH * 0.62)
                const pillX = x + w - metrics.cardPad - timeW
                const pillY = rowY + (metrics.rowH - pillH) / 2 - 2

                fillRoundRect(ctx, pillX, pillY, timeW, pillH, pillH / 2, C.surfaceSoft)
                ctx.fillStyle = C.accent
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText(timeLabel, pillX + timeW / 2, pillY + pillH / 2)

                ctx.textAlign = 'left'
                ctx.textBaseline = 'middle'
                ctx.fillStyle = C.text
                ctx.font = `${Math.round(metrics.doctorFont)}px Inter, system-ui, sans-serif`
                const nameMax = Math.max(40, pillX - (x + metrics.cardPad + 8) - 12)
                drawTruncatedText(
                    ctx,
                    doctorName,
                    x + metrics.cardPad + 4,
                    rowY + metrics.rowH / 2 - 2,
                    nameMax,
                )

                rowY += metrics.rowH
            }

            return h
        }

        ctx.save()
        roundRect(ctx, sheetX, sheetY, sheetW, sheetH, SHEET_RADIUS)
        ctx.clip()

        if (groupedSchedules.length === 0) {
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            const cx = sheetX + sheetW / 2
            const cy = sheetY + sheetH / 2
            fillRoundRect(ctx, cx - 40, cy - 90, 80, 80, 24, C.surfaceSoft)
            ctx.strokeStyle = C.accent
            ctx.lineWidth = 3
            // Simple calendar outline
            roundRect(ctx, cx - 22, cy - 72, 44, 40, 8)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(cx - 22, cy - 58)
            ctx.lineTo(cx + 22, cy - 58)
            ctx.stroke()

            ctx.fillStyle = C.text
            ctx.font = 'bold 36px Inter, system-ui, sans-serif'
            ctx.fillText('Tidak ada jadwal', cx, cy + 20)
            ctx.fillStyle = C.muted
            ctx.font = '24px Inter, system-ui, sans-serif'
            ctx.fillText('Belum ada dokter pada tanggal ini.', cx, cy + 60)
        } else if (metrics.columns === 1) {
            let y = contentY
            for (const group of groupedSchedules) {
                const h = paintCard(group, contentX, y, contentW)
                y += h + metrics.cardGap
            }
        } else {
            const gutter = 16
            const colW = (contentW - gutter) / 2
            const colX = [contentX, contentX + colW + gutter]
            const colY = [contentY, contentY]
            for (const group of groupedSchedules) {
                const idx = colY[0] <= colY[1] ? 0 : 1
                const h = paintCard(group, colX[idx], colY[idx], colW)
                colY[idx] += h + metrics.cardGap
            }
        }

        ctx.restore()

        // 7. Footer brand
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = C.muted
        ctx.font = '22px Inter, system-ui, sans-serif'
        ctx.fillText('Jadwal Dokter · JADOK', STORY_WIDTH / 2, STORY_HEIGHT - SHEET_BOTTOM_PAD / 2)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
    }

    const renderStoryPng = async (): Promise<string> => {
        const canvas = canvasRef.current
        if (!canvas) throw new Error('Canvas missing')
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas context missing')

        canvas.width = STORY_WIDTH
        canvas.height = STORY_HEIGHT

        const logo = await loadLogo()
        paintStoryCanvas(ctx, logo)
        return canvas.toDataURL('image/png')
    }

    const openPreview = async () => {
        if (previewing || exporting || loading) return
        setPreviewing(true)
        setExportError(null)
        try {
            const url = await renderStoryPng()
            setPreviewUrl(url)
            setPreviewOpen(true)
        } catch (err) {
            console.error('Preview failed:', err)
            setExportError('Export gagal. Silakan coba lagi.')
        } finally {
            setPreviewing(false)
        }
    }

    const confirmExport = async () => {
        if (exporting) return
        setExporting(true)
        setExportError(null)
        try {
            const url = previewUrl ?? (await renderStoryPng())
            const link = document.createElement('a')
            link.download = `jadwal-story-${exportDate}.png`
            link.href = url
            link.click()
            setPreviewOpen(false)
        } catch (err) {
            console.error('Export failed:', err)
            setExportError('Export gagal. Silakan coba lagi.')
        } finally {
            setExporting(false)
        }
    }

    const closePreview = () => {
        setPreviewOpen(false)
    }

    return (
        <div className="page-shell">
            <section className="page-header">
                <div>
                    <h1 className="page-title">Ekspor Jadwal</h1>
                    <p className="page-subtitle">
                        Pratinjau jadwal, lalu unduh gambar 9:16 setelah konfirmasi.
                    </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                        type="date"
                        value={exportDate}
                        onChange={(e) => setExportDate(e.target.value)}
                        className="input"
                    />
                    <button
                        type="button"
                        onClick={() => void openPreview()}
                        disabled={loading || exporting || previewing}
                        className="btn btn-primary"
                    >
                        <Download className="mr-2 h-4 w-4" />
                        {previewing ? 'Menyiapkan...' : 'Pratinjau Ekspor'}
                    </button>
                </div>
            </section>

            {exportError && !previewOpen && <div className="alert-error mb-4">{exportError}</div>}

            <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-[var(--app-bg)] px-5 py-5">
                    <div className="flex items-center gap-3">
                        <BrandLogo variant="icon" className="h-10 w-10 rounded-lg border border-slate-200" />
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">Jadwal Dokter</h2>
                            <p className="text-sm text-slate-500">{formatLongDateID(exportDate)}</p>
                        </div>
                    </div>
                    <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-teal-100 bg-teal-50 px-3 py-2 text-teal-800">
                        <Stethoscope className="h-4 w-4 text-teal-600" />
                        <span className="text-sm font-semibold">{totalDoctors} dokter</span>
                    </div>
                </div>

                <div className="min-h-[420px] p-4">
                    {loading ? (
                        <div className="flex min-h-[360px] items-center justify-center text-sm font-medium text-slate-500">
                            Memuat jadwal...
                        </div>
                    ) : error ? (
                        <div className="flex min-h-[360px] items-center justify-center text-center text-sm font-semibold text-red-600">
                            {error}
                        </div>
                    ) : groupedSchedules.length === 0 ? (
                        <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                                <CalendarDays className="h-6 w-6" />
                            </div>
                            <p className="text-base font-semibold text-slate-900">Tidak ada jadwal dokter pada tanggal ini.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {groupedSchedules.map((group) => (
                                <div key={group.department} className="overflow-hidden rounded-xl border border-slate-200 border-l-4 border-l-teal-500">
                                    <div className="border-b border-teal-100 bg-teal-50 px-4 py-3">
                                        <p className="text-[11px] font-medium text-teal-700">Poliklinik</p>
                                        <h3 className="truncate text-base font-semibold text-slate-900" title={group.department}>
                                            {group.department}
                                        </h3>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                        {group.schedules.map((schedule) => (
                                            <div
                                                key={schedule.id}
                                                className="flex items-center justify-between gap-3 px-4 py-3"
                                            >
                                                <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                                                    {schedule.doctors?.name}
                                                </p>
                                                <div className="inline-flex shrink-0 items-center rounded-lg border border-teal-100 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800">
                                                    <Clock className="mr-1.5 h-3.5 w-3.5 text-teal-600" />
                                                    {schedule.start_time.slice(0, 5)} - {schedule.end_time.slice(0, 5)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <canvas ref={canvasRef} className="hidden" />

            {previewOpen && (
                <div className="modal-backdrop" onClick={closePreview}>
                    <div
                        className="modal-card max-h-[90vh] max-w-lg overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-xl font-semibold">Pratinjau Ekspor</h2>
                            <button type="button" onClick={closePreview} className="action-icon" aria-label="Tutup">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <p className="mb-4 text-sm text-slate-500">
                            Gambar 9:16 (1080×1920) untuk Instagram Story — {formatLongDateID(exportDate)}.
                        </p>
                        <div className="mx-auto mb-5 w-full max-w-[280px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
                            {previewUrl ? (
                                <img src={previewUrl} alt="Pratinjau jadwal story" className="block h-auto w-full" />
                            ) : (
                                <div className="flex aspect-[9/16] items-center justify-center text-sm text-slate-500">
                                    Memuat pratinjau...
                                </div>
                            )}
                        </div>
                        {exportError && <div className="alert-error mb-4">{exportError}</div>}
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={closePreview}
                                disabled={exporting}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => void confirmExport()}
                                disabled={exporting || !previewUrl}
                            >
                                <Download className="mr-2 h-4 w-4" />
                                {exporting ? 'Mengunduh...' : 'Ekspor'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
