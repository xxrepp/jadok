import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Database } from '../../types/database.types'
import { Archive, CalendarDays, Check, Clock, Download, Eye, ImagePlus, Stethoscope, Trash2, X } from 'lucide-react'
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

type ExportBackground = Database['public']['Tables']['export_backgrounds']['Row']

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
const LOGO_SRC = '/assets/jadok%20logo.png'
const FOOTER_SRC = '/assets/footer.png'

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

const HERO_BOTTOM = 520
const SHEET_INSET = 80
const SHEET_TOP = 360
const SHEET_BOTTOM_PAD = 40
const SHEET_RADIUS = 36
const SHEET_INNER_PAD = 24
const CHIP_SHEET_GAP = 12
const FOOTER_TOP_GAP = 18
const LOGO_PLATE_W_MAX = 420
const LOGO_PLATE_H = 117
const LOGO_PLATE_Y = 44
const LOGO_IMG_SCALE = 2.45
const LOGO_PLATE_ASPECT = LOGO_PLATE_W_MAX / LOGO_PLATE_H
const TITLE_FONT_PX = 56
const TITLE_LINE_GAP = 10
const TITLE_TO_DATE_GAP = 18
const DATE_TO_CHIP_GAP = 18
const DATE_FONT_PX = 28
const CHIP_H = 40

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

function loadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = src
    })
}

function loadLogo() {
    return loadImage(LOGO_SRC)
}

function loadFooter() {
    return loadImage(FOOTER_SRC)
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

/** Cover-draw image into a rectangle without stretching (object-cover). */
function drawImageCover(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number,
) {
    const iw = img.naturalWidth || img.width
    const ih = img.naturalHeight || img.height
    if (!iw || !ih || w <= 0 || h <= 0) return

    const imageRatio = iw / ih
    const boxRatio = w / h
    let sw = iw
    let sh = ih
    let sx = 0
    let sy = 0
    if (imageRatio > boxRatio) {
        sw = ih * boxRatio
        sx = (iw - sw) / 2
    } else {
        sh = iw / boxRatio
        sy = (ih - sh) / 2
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

function paintDefaultGradient(ctx: CanvasRenderingContext2D) {
    const bg = ctx.createLinearGradient(0, 0, 0, STORY_HEIGHT)
    bg.addColorStop(0, C.bgTop)
    bg.addColorStop(0.22, C.bgTopDeep)
    bg.addColorStop(0.38, C.bgBottom)
    bg.addColorStop(1, C.bgBottom)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT)
}

/** Like BrandLogo brand variant: object-contain then CSS scale, clipped to plate. */
function drawImageContainScaled(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number,
    scale: number,
) {
    const iw = img.naturalWidth || img.width
    const ih = img.naturalHeight || img.height
    if (!iw || !ih || w <= 0 || h <= 0) return

    const imageRatio = iw / ih
    const boxRatio = w / h
    let dw = w
    let dh = h
    if (imageRatio > boxRatio) {
        dh = w / imageRatio
    } else {
        dw = h * imageRatio
    }
    dw *= scale
    dh *= scale
    const dx = x + (w - dw) / 2
    const dy = y + (h - dh) / 2

    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    ctx.drawImage(img, dx, dy, dw, dh)
    ctx.restore()
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
    const [backgrounds, setBackgrounds] = useState<ExportBackground[]>([])
    const [backgroundsLoading, setBackgroundsLoading] = useState(true)
    const [backgroundError, setBackgroundError] = useState<string | null>(null)
    const [showArchivedBackgrounds, setShowArchivedBackgrounds] = useState(false)
    const [uploadingBackground, setUploadingBackground] = useState(false)
    const [backgroundActionId, setBackgroundActionId] = useState<number | null>(null)
    const [templatePreview, setTemplatePreview] = useState<ExportBackground | null>(null)
    const [confirmDialog, setConfirmDialog] = useState<null | {
        title: string
        message: string
        confirmLabel: string
        danger?: boolean
        action: () => Promise<void>
    }>(null)
    const [renamingId, setRenamingId] = useState<number | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const [renameSaving, setRenameSaving] = useState(false)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        void fetchSchedules()
    }, [exportDate])

    useEffect(() => {
        void fetchBackgrounds()
    }, [])

    useEffect(() => {
        setPreviewOpen(false)
        setPreviewUrl(null)
    }, [exportDate])

    const fetchBackgrounds = async () => {
        try {
            setBackgroundsLoading(true)
            setBackgroundError(null)
            const { data, error: fetchError } = await supabase
                .from('export_backgrounds')
                .select('*')
                .order('sort_order')
            if (fetchError) throw fetchError
            setBackgrounds((data as ExportBackground[]) || [])
        } catch (err) {
            console.error('Error fetching export backgrounds:', err)
            setBackgroundError('Gagal memuat latar ekspor.')
            setBackgrounds([])
        } finally {
            setBackgroundsLoading(false)
        }
    }

    const activeBackground =
        backgrounds.find((bg) => bg.is_active && !bg.is_archived) ||
        backgrounds.find((bg) => bg.kind === 'default' && !bg.is_archived) ||
        null

    const visibleBackgrounds = backgrounds
        .filter((bg) => (showArchivedBackgrounds ? true : !bg.is_archived))
        .sort((a, b) => {
            if (a.kind === 'default' && b.kind !== 'default') return -1
            if (b.kind === 'default' && a.kind !== 'default') return 1
            if (a.is_archived !== b.is_archived) return a.is_archived ? 1 : -1
            return (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id
        })

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
        footer: HTMLImageElement | null,
        backgroundImage: HTMLImageElement | null,
    ) => {
        const deptCount = groupedSchedules.length
        const mode = pickDensityMode(totalDoctors, deptCount)
        let metrics = baseMetrics(mode, deptCount)

        const titleFont = TITLE_FONT_PX
        const titleLineGap = TITLE_LINE_GAP
        ctx.font = `bold ${titleFont}px Inter, system-ui, sans-serif`
        const titleWidth = ctx.measureText('Jadwal Dokter').width
        const logoPlateW = Math.min(
            LOGO_PLATE_W_MAX,
            Math.max(240, Math.round(titleWidth * 0.88)),
        )
        const logoPlateH = Math.round(logoPlateW / LOGO_PLATE_ASPECT)
        const logoPlateY = LOGO_PLATE_Y
        const titleY = logo ? logoPlateY + logoPlateH + 20 : 72
        const subtitleY = titleY + titleFont + titleLineGap
        const dateY = subtitleY + titleFont + TITLE_TO_DATE_GAP
        const chipH = CHIP_H
        const chipY = dateY + DATE_FONT_PX + DATE_TO_CHIP_GAP
        const sheetX = SHEET_INSET
        const sheetY = Math.max(SHEET_TOP, chipY + chipH + CHIP_SHEET_GAP)
        const sheetW = STORY_WIDTH - SHEET_INSET * 2
        const sheetH = STORY_HEIGHT - sheetY - SHEET_BOTTOM_PAD
        const contentW = sheetW - SHEET_INNER_PAD * 2
        const contentX = sheetX + SHEET_INNER_PAD
        const contentY = sheetY + SHEET_INNER_PAD

        let footerDrawW = 0
        let footerDrawH = 0
        if (footer) {
            const iw = footer.naturalWidth || footer.width
            const ih = footer.naturalHeight || footer.height
            if (iw > 0 && ih > 0) {
                footerDrawW = contentW
                footerDrawH = footerDrawW * (ih / iw)
            }
        }
        const footerBlock = footerDrawH > 0 ? footerDrawH + FOOTER_TOP_GAP : 0
        const contentInnerH = sheetH - SHEET_INNER_PAD * 2 - footerBlock

        let scale = 1
        const estimated = estimateContentHeight(groupedSchedules, metrics)
        if (estimated > contentInnerH) {
            scale = Math.max(0.72, contentInnerH / estimated)
        }
        metrics = scaleMetrics(metrics, scale)

        // Full-canvas background: image cover or built-in teal gradient.
        if (backgroundImage) {
            drawImageCover(ctx, backgroundImage, 0, 0, STORY_WIDTH, STORY_HEIGHT)
        } else {
            paintDefaultGradient(ctx)
        }

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
        ctx.fillRect(0, 0, STORY_WIDTH, Math.max(HERO_BOTTOM, sheetY))

        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'

        if (logo) {
            const plateX = (STORY_WIDTH - logoPlateW) / 2
            fillRoundRect(ctx, plateX, logoPlateY, logoPlateW, logoPlateH, 24, C.surface)
            drawImageContainScaled(
                ctx,
                logo,
                plateX,
                logoPlateY,
                logoPlateW,
                logoPlateH,
                LOGO_IMG_SCALE,
            )
        }

        ctx.fillStyle = C.surface
        ctx.font = `bold ${titleFont}px Inter, system-ui, sans-serif`
        ctx.fillText('Jadwal Dokter', STORY_WIDTH / 2, titleY)
        ctx.fillText('Poliklinik Rawat Jalan', STORY_WIDTH / 2, subtitleY)

        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.font = `${DATE_FONT_PX}px Inter, system-ui, sans-serif`
        ctx.fillText(formatLongDateID(exportDate), STORY_WIDTH / 2, dateY)

        const chipLabel =
            deptCount > 0
                ? `${totalDoctors} dokter · ${deptCount} poliklinik`
                : `${totalDoctors} dokter`
        ctx.font = 'bold 22px Inter, system-ui, sans-serif'
        const chipPadX = 22
        const chipW = Math.min(contentW, ctx.measureText(chipLabel).width + chipPadX * 2)
        const chipX = (STORY_WIDTH - chipW) / 2
        fillRoundRect(ctx, chipX, chipY, chipW, chipH, 20, C.primarySoft)
        ctx.fillStyle = C.accent
        ctx.textBaseline = 'middle'
        ctx.fillText(chipLabel, STORY_WIDTH / 2, chipY + chipH / 2)
        ctx.textBaseline = 'top'

        fillRoundRect(ctx, sheetX, sheetY, sheetW, sheetH, SHEET_RADIUS, C.surface)
        strokeRoundRect(ctx, sheetX, sheetY, sheetW, sheetH, SHEET_RADIUS, C.border, 2)

        const paintCard = (group: GroupedSchedule, x: number, y: number, w: number) => {
            const h = cardHeight(group.schedules.length, metrics)
            const r = 20 * Math.min(1, scale)

            fillRoundRect(ctx, x, y, w, h, r, C.surface)
            strokeRoundRect(ctx, x, y, w, h, r, C.border, 2)

            ctx.save()
            roundRect(ctx, x, y, w, h, r)
            ctx.clip()
            ctx.fillStyle = C.accent
            ctx.fillRect(x, y, 8, h)
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
            const cy = sheetY + (sheetH - footerBlock) / 2
            fillRoundRect(ctx, cx - 40, cy - 90, 80, 80, 24, C.surfaceSoft)
            ctx.strokeStyle = C.accent
            ctx.lineWidth = 3
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

        if (footer && footerDrawH > 0) {
            const footerX = contentX
            const footerY = sheetY + sheetH - SHEET_INNER_PAD - footerDrawH
            ctx.drawImage(footer, footerX, footerY, footerDrawW, footerDrawH)
        }

        ctx.restore()
    }

    const renderStoryPng = async (): Promise<string> => {
        const canvas = canvasRef.current
        if (!canvas) throw new Error('Canvas missing')
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas context missing')

        canvas.width = STORY_WIDTH
        canvas.height = STORY_HEIGHT

        const [logo, footer] = await Promise.all([loadLogo(), loadFooter()])
        let backgroundImage: HTMLImageElement | null = null
        if (activeBackground?.kind === 'image' && activeBackground.image_url) {
            backgroundImage = await loadImage(activeBackground.image_url)
        }
        paintStoryCanvas(ctx, logo, footer, backgroundImage)
        return canvas.toDataURL('image/png')
    }

    const handleUploadBackground = async (file: File | null) => {
        if (!file) return
        setUploadingBackground(true)
        setBackgroundError(null)
        try {
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
            const filePath = `export-bg/${Date.now()}-${safeName}`
            const { error: uploadError } = await supabase.storage
                .from('export-backgrounds')
                .upload(filePath, file)
            if (uploadError) throw uploadError

            const { data: { publicUrl } } = supabase.storage
                .from('export-backgrounds')
                .getPublicUrl(filePath)

            const baseName = file.name.replace(/\.[^.]+$/, '').trim() || 'Latar kustom'
            const { error: insertError } = await supabase
                .from('export_backgrounds')
                .insert({
                    name: baseName,
                    image_url: publicUrl,
                    kind: 'image',
                    is_active: false,
                    is_archived: false,
                    sort_order: backgrounds.length + 1,
                })
            if (insertError) throw insertError
            await fetchBackgrounds()
        } catch (err: any) {
            console.error('Upload background failed:', err)
            setBackgroundError(err?.message || 'Gagal mengunggah latar.')
        } finally {
            setUploadingBackground(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleActivateBackground = async (id: number) => {
        setBackgroundActionId(id)
        setBackgroundError(null)
        try {
            const { error: rpcError } = await supabase.rpc('set_active_export_background', {
                background_id: id,
            })
            if (rpcError) throw rpcError
            await fetchBackgrounds()
            setPreviewOpen(false)
            setPreviewUrl(null)
        } catch (err: any) {
            console.error('Activate background failed:', err)
            setBackgroundError(err?.message || 'Gagal mengaktifkan latar.')
        } finally {
            setBackgroundActionId(null)
        }
    }

    const handleArchiveBackground = async (bg: ExportBackground) => {
        if (bg.kind === 'default') return
        setConfirmDialog({
            title: 'Arsipkan latar?',
            message: `Latar "${bg.name}" akan dipindah ke arsip. Anda bisa mengembalikannya nanti.`,
            confirmLabel: 'Arsipkan',
            action: async () => {
                setBackgroundActionId(bg.id)
                setBackgroundError(null)
                try {
                    const { error: rpcError } = await supabase.rpc('archive_export_background', {
                        background_id: bg.id,
                    })
                    if (rpcError) throw rpcError
                    await fetchBackgrounds()
                    if (templatePreview?.id === bg.id) {
                        setTemplatePreview((prev) => (prev ? { ...prev, is_archived: true, is_active: false } : prev))
                    }
                } catch (err: any) {
                    console.error('Archive background failed:', err)
                    setBackgroundError(err?.message || 'Gagal mengarsipkan latar.')
                } finally {
                    setBackgroundActionId(null)
                }
            },
        })
    }

    const handleUnarchiveBackground = async (bg: ExportBackground) => {
        if (bg.kind === 'default') return
        setBackgroundActionId(bg.id)
        setBackgroundError(null)
        try {
            const { error: rpcError } = await supabase.rpc('unarchive_export_background', {
                background_id: bg.id,
            })
            if (rpcError) throw rpcError
            await fetchBackgrounds()
            if (templatePreview?.id === bg.id) {
                setTemplatePreview((prev) => (prev ? { ...prev, is_archived: false } : prev))
            }
        } catch (err: any) {
            console.error('Unarchive background failed:', err)
            setBackgroundError(err?.message || 'Gagal mengembalikan latar dari arsip.')
        } finally {
            setBackgroundActionId(null)
        }
    }

    const handleDeleteBackground = async (bg: ExportBackground) => {
        if (bg.kind === 'default') return
        setConfirmDialog({
            title: 'Hapus latar permanen?',
            message: `Latar "${bg.name}" dan filenya akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`,
            confirmLabel: 'Hapus',
            danger: true,
            action: async () => {
                setBackgroundActionId(bg.id)
                setBackgroundError(null)
                try {
                    const { error: rpcError } = await supabase.rpc('delete_export_background', {
                        background_id: bg.id,
                    })
                    if (rpcError) throw rpcError
                    await fetchBackgrounds()
                    if (templatePreview?.id === bg.id) setTemplatePreview(null)
                    if (renamingId === bg.id) {
                        setRenamingId(null)
                        setRenameValue('')
                    }
                } catch (err: any) {
                    console.error('Delete background failed:', err)
                    setBackgroundError(err?.message || 'Gagal menghapus latar.')
                } finally {
                    setBackgroundActionId(null)
                }
            },
        })
    }

    const startRenameBackground = (bg: ExportBackground) => {
        setRenamingId(bg.id)
        setRenameValue(bg.name)
        setBackgroundError(null)
    }

    const cancelRenameBackground = () => {
        setRenamingId(null)
        setRenameValue('')
    }

    const saveRenameBackground = async (bg: ExportBackground) => {
        const nextName = renameValue.trim()
        if (!nextName) {
            setBackgroundError('Nama latar wajib diisi.')
            return
        }
        if (nextName === bg.name) {
            cancelRenameBackground()
            return
        }
        setRenameSaving(true)
        setBackgroundError(null)
        try {
            const { error: updateError } = await supabase
                .from('export_backgrounds')
                .update({ name: nextName })
                .eq('id', bg.id)
            if (updateError) throw updateError
            await fetchBackgrounds()
            if (templatePreview?.id === bg.id) {
                setTemplatePreview((prev) => (prev ? { ...prev, name: nextName } : prev))
            }
            cancelRenameBackground()
        } catch (err: any) {
            console.error('Rename background failed:', err)
            setBackgroundError(err?.message || 'Gagal mengganti nama latar.')
        } finally {
            setRenameSaving(false)
        }
    }

    const runConfirmDialog = async () => {
        if (!confirmDialog) return
        const action = confirmDialog.action
        setConfirmDialog(null)
        await action()
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
                        Pratinjau lalu ekspor jadwal dokter.
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
            {backgroundError && <div className="alert-error mb-4">{backgroundError}</div>}

            <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Latar Ekspor</h2>
                        <p className="text-sm text-slate-500">
                            Satu latar aktif dipakai semua Humas. Default teal selalu tersedia.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setShowArchivedBackgrounds((v) => !v)}
                        >
                            {showArchivedBackgrounds ? 'Sembunyikan arsip' : 'Tampilkan arsip'}
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => void handleUploadBackground(e.target.files?.[0] || null)}
                        />
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={uploadingBackground}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <ImagePlus className="mr-2 h-4 w-4" />
                            {uploadingBackground ? 'Mengunggah...' : 'Unggah Latar'}
                        </button>
                    </div>
                </div>

                {backgroundsLoading ? (
                    <div className="py-8 text-center text-sm text-slate-500">Memuat latar...</div>
                ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {visibleBackgrounds.map((bg) => {
                            const busy = backgroundActionId === bg.id
                            return (
                                <div
                                    key={bg.id}
                                    className={`overflow-hidden rounded-xl border ${
                                        bg.is_active
                                            ? 'border-teal-500 ring-2 ring-teal-100'
                                            : 'border-slate-200'
                                    } ${bg.is_archived ? 'opacity-70' : ''}`}
                                >
                                    <button
                                        type="button"
                                        className="block w-full text-left"
                                        onClick={() => setTemplatePreview(bg)}
                                        title="Lihat pratinjau latar"
                                    >
                                        <div className="relative aspect-[9/16] max-h-48 w-full overflow-hidden bg-slate-100">
                                            {bg.kind === 'default' || !bg.image_url ? (
                                                <div
                                                    className="h-full w-full"
                                                    style={{
                                                        background:
                                                            'linear-gradient(180deg, #0d9488 0%, #0f766e 22%, #eef6f5 55%, #eef6f5 100%)',
                                                    }}
                                                />
                                            ) : (
                                                <img
                                                    src={bg.image_url}
                                                    alt={bg.name}
                                                    className="h-full w-full object-cover"
                                                />
                                            )}
                                            {bg.is_active && (
                                                <span className="absolute left-2 top-2 inline-flex items-center rounded-full bg-teal-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                                                    <Check className="mr-1 h-3 w-3" />
                                                    Aktif
                                                </span>
                                            )}
                                            {bg.is_archived && (
                                                <span className="absolute right-2 top-2 rounded-full bg-slate-700/80 px-2 py-0.5 text-[11px] font-semibold text-white">
                                                    Arsip
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                    <div className="space-y-2 p-3">
                                        <div>
                                            {renamingId === bg.id ? (
                                                <div className="space-y-2">
                                                    <input
                                                        autoFocus
                                                        value={renameValue}
                                                        onChange={(e) => setRenameValue(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') void saveRenameBackground(bg)
                                                            if (e.key === 'Escape') cancelRenameBackground()
                                                        }}
                                                        className="input !py-1.5 text-sm"
                                                        maxLength={80}
                                                    />
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            className="btn btn-primary !px-2 !py-1 text-xs"
                                                            disabled={renameSaving}
                                                            onClick={() => void saveRenameBackground(bg)}
                                                        >
                                                            {renameSaving ? '...' : 'Simpan'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary !px-2 !py-1 text-xs"
                                                            disabled={renameSaving}
                                                            onClick={cancelRenameBackground}
                                                        >
                                                            Batal
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="group flex w-full items-start text-left"
                                                    onClick={() => startRenameBackground(bg)}
                                                    title="Klik untuk ganti nama"
                                                >
                                                    <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-teal-700">
                                                        {bg.name}
                                                    </p>
                                                </button>
                                            )}
                                            <p className="text-xs text-slate-500">
                                                {bg.kind === 'default' ? 'Bawaan sistem' : 'Kustom'}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className="btn btn-secondary !px-2 !py-1 text-xs"
                                                onClick={() => setTemplatePreview(bg)}
                                            >
                                                <Eye className="mr-1 h-3.5 w-3.5" />
                                                Lihat
                                            </button>
                                            {!bg.is_active && !bg.is_archived && (
                                                <button
                                                    type="button"
                                                    className="btn btn-primary !px-2 !py-1 text-xs"
                                                    disabled={busy}
                                                    onClick={() => void handleActivateBackground(bg.id)}
                                                >
                                                    {busy ? '...' : 'Aktifkan'}
                                                </button>
                                            )}
                                            {bg.kind !== 'default' && !bg.is_archived && (
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary !px-2 !py-1 text-xs"
                                                    disabled={busy}
                                                    onClick={() => void handleArchiveBackground(bg)}
                                                >
                                                    <Archive className="mr-1 h-3.5 w-3.5" />
                                                    Arsip
                                                </button>
                                            )}
                                            {bg.kind !== 'default' && bg.is_archived && (
                                                <button
                                                    type="button"
                                                    className="btn btn-primary !px-2 !py-1 text-xs"
                                                    disabled={busy}
                                                    onClick={() => void handleUnarchiveBackground(bg)}
                                                >
                                                    {busy ? '...' : 'Batal Arsip'}
                                                </button>
                                            )}
                                            {bg.kind !== 'default' && (
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary !px-2 !py-1 text-xs text-red-600"
                                                    disabled={busy}
                                                    onClick={() => void handleDeleteBackground(bg)}
                                                >
                                                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                                                    Hapus
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </section>

            <section className="mx-auto w-full max-w-7xl">
                <div className="page-header mb-4">
                    <div className="flex items-center gap-4">
                        <BrandLogo variant="icon" className="hidden h-11 w-11 shrink-0 rounded-xl border border-slate-200 sm:inline-flex" />
                        <div>
                            <h2 className="text-xl font-semibold text-slate-900">Jadwal Dokter</h2>
                            <p className="text-sm text-slate-500">{formatLongDateID(exportDate)}</p>
                        </div>
                    </div>
                    <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-teal-900">
                        <div className="flex items-center gap-2">
                            <Stethoscope className="h-4 w-4 text-teal-600" />
                            <span className="text-xl font-semibold">{totalDoctors}</span>
                        </div>
                        <p className="text-xs text-teal-700">Dokter</p>
                    </div>
                </div>

                {loading ? (
                    <div className="panel flex min-h-[40vh] items-center justify-center text-sm font-medium text-slate-500">
                        Memuat jadwal...
                    </div>
                ) : error ? (
                    <div className="alert-error flex min-h-[40vh] items-center justify-center text-center text-lg font-semibold">
                        {error}
                    </div>
                ) : groupedSchedules.length === 0 ? (
                    <div className="panel flex min-h-[40vh] flex-col items-center justify-center text-center">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                            <CalendarDays className="h-8 w-8" />
                        </div>
                        <h2 className="text-2xl font-semibold text-slate-900">Tidak ada jadwal dokter pada tanggal ini.</h2>
                        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                            Pilih tanggal lain, atau pastikan jadwal sudah diinput.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {groupedSchedules.map((group) => (
                            <div key={group.department} className="card flex h-full flex-col">
                                <div className="border-b border-teal-100 bg-teal-50 px-5 py-4">
                                    <p className="text-xs font-medium text-teal-700">Poliklinik</p>
                                    <h3 className="mt-1 truncate text-xl font-semibold text-slate-900" title={group.department}>
                                        {group.department}
                                    </h3>
                                </div>
                                <div className="flex-1 divide-y divide-slate-100 p-2">
                                    {group.schedules.map((schedule) => (
                                        <div key={schedule.id} className="rounded-lg p-4 transition-colors hover:bg-teal-50/50">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="min-w-0">
                                                    <h4
                                                        className="truncate text-base font-semibold text-slate-900"
                                                        title={schedule.doctors?.name || '-'}
                                                    >
                                                        {schedule.doctors?.name || '-'}
                                                    </h4>
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
            </section>

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
                            {activeBackground ? ` Latar aktif: ${activeBackground.name}.` : ''}
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

            {templatePreview && (
                <div className="modal-backdrop" onClick={() => setTemplatePreview(null)}>
                    <div
                        className="modal-card max-h-[90vh] max-w-lg overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-4 flex items-center justify-between gap-3">
                            {renamingId === templatePreview.id ? (
                                <div className="min-w-0 flex-1 space-y-2">
                                    <input
                                        autoFocus
                                        value={renameValue}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') void saveRenameBackground(templatePreview)
                                            if (e.key === 'Escape') cancelRenameBackground()
                                        }}
                                        className="input"
                                        maxLength={80}
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="btn btn-primary !px-3 !py-1.5 text-sm"
                                            disabled={renameSaving}
                                            onClick={() => void saveRenameBackground(templatePreview)}
                                        >
                                            {renameSaving ? 'Menyimpan...' : 'Simpan nama'}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-secondary !px-3 !py-1.5 text-sm"
                                            disabled={renameSaving}
                                            onClick={cancelRenameBackground}
                                        >
                                            Batal
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    className="min-w-0 text-left"
                                    onClick={() => startRenameBackground(templatePreview)}
                                    title="Klik untuk ganti nama"
                                >
                                    <h2 className="truncate text-xl font-semibold hover:text-teal-700">
                                        {templatePreview.name}
                                    </h2>
                                    <p className="text-xs text-slate-500">Klik nama untuk mengganti</p>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setTemplatePreview(null)}
                                className="action-icon shrink-0"
                                aria-label="Tutup"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="mx-auto mb-5 w-full max-w-[280px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
                            {templatePreview.kind === 'default' || !templatePreview.image_url ? (
                                <div
                                    className="aspect-[9/16] w-full"
                                    style={{
                                        background:
                                            'linear-gradient(180deg, #0d9488 0%, #0f766e 22%, #eef6f5 55%, #eef6f5 100%)',
                                    }}
                                />
                            ) : (
                                <img
                                    src={templatePreview.image_url}
                                    alt={templatePreview.name}
                                    className="block h-auto w-full"
                                />
                            )}
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                            {!templatePreview.is_active && !templatePreview.is_archived && (
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    disabled={backgroundActionId === templatePreview.id}
                                    onClick={() => void handleActivateBackground(templatePreview.id)}
                                >
                                    Jadikan Aktif
                                </button>
                            )}
                            {templatePreview.kind !== 'default' && !templatePreview.is_archived && (
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={backgroundActionId === templatePreview.id}
                                    onClick={() => void handleArchiveBackground(templatePreview)}
                                >
                                    Arsipkan
                                </button>
                            )}
                            {templatePreview.kind !== 'default' && templatePreview.is_archived && (
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    disabled={backgroundActionId === templatePreview.id}
                                    onClick={() => void handleUnarchiveBackground(templatePreview)}
                                >
                                    Batal Arsip
                                </button>
                            )}
                            {templatePreview.kind !== 'default' && (
                                <button
                                    type="button"
                                    className="btn btn-secondary text-red-600"
                                    disabled={backgroundActionId === templatePreview.id}
                                    onClick={() => void handleDeleteBackground(templatePreview)}
                                >
                                    Hapus
                                </button>
                            )}
                            <button type="button" className="btn btn-secondary" onClick={() => setTemplatePreview(null)}>
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmDialog && (
                <div className="modal-backdrop" onClick={() => setConfirmDialog(null)}>
                    <div
                        className="modal-card max-w-md"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="mb-2 text-xl font-semibold text-slate-900">{confirmDialog.title}</h2>
                        <p className="mb-6 text-sm leading-6 text-slate-600">{confirmDialog.message}</p>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setConfirmDialog(null)}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className={`btn ${confirmDialog.danger ? 'btn-secondary text-red-600' : 'btn-primary'}`}
                                onClick={() => void runConfirmDialog()}
                            >
                                {confirmDialog.confirmLabel}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
