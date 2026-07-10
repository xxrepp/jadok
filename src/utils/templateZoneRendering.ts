import { DEFAULT_TEMPLATE_ZONE_FONT } from './templateZoneFonts'

export type TemplateZoneType = 'schedule' | 'date' | 'text'
export type ScheduleLayout = 'stacked' | 'pr-card' | 'pr-list'

export type TemplateZoneLike = {
    id?: number
    department_id?: number | null
    pos_x?: number | null
    pos_y?: number | null
    width?: number | null
    height?: number | null
    font_size?: number | null
    font_color?: string | null
    font_family?: string | null
    text_align?: string | null
    zone_type?: string | null
    custom_text?: string | null
    schedule_layout?: ScheduleLayout | string | null
}

export type ScheduleLike = {
    start_time: string
    end_time: string
    doctors?: {
        name?: string | null
        department_id?: number | null
    } | null
}

export type DepartmentLike = {
    id: number
    name: string | null
}

export type ScheduleLayoutItem = {
    time: string
    name: string
    nameLines: string[]
    nameFitText: string
    xRatio?: number
    yRatio: number
    timeXRatio?: number
    nameXRatio?: number
    align: CanvasTextAlign
    columnWidthRatio?: number
    timeFontScale: number
    nameFontScale: number
    lineGapRatio: number
}

export type ZoneTextStyle = {
    fontWeight: string
    lineHeightRatio: number
    letterSpacingEm: number
}

export const DEFAULT_GRID_SIZE = 10

export function getCurrentExportDate(getLocalDate: () => string, selectedDate?: string | null) {
    return selectedDate || getLocalDate()
}

export function snapValueToGrid(value: number, gridSize = DEFAULT_GRID_SIZE, enabled = true) {
    if (!enabled || gridSize <= 0) return Math.round(value)
    return Math.round(value / gridSize) * gridSize
}

export function getZoneLabel(zone: TemplateZoneLike, departments: DepartmentLike[] = []) {
    if (zone.zone_type === 'schedule') {
        return departments.find(dept => dept.id === zone.department_id)?.name || 'No Dept'
    }

    if (zone.zone_type === 'date') return 'Tanggal'
    if (zone.zone_type === 'text') return zone.custom_text || 'Teks'
    return 'Zona'
}

function normalizeScheduleLayout(layout?: string | null): ScheduleLayout {
    if (layout === 'stacked') return 'stacked'
    if (layout === 'pr-list') return 'pr-list'
    return 'pr-card'
}

export function formatScheduleTime(startTime: string, endTime: string) {
    return `${startTime.slice(0, 5).replace(':', '.')} - ${endTime.slice(0, 5).replace(':', '.')}`
}

export function getSchedulesForZone(zone: TemplateZoneLike, schedules: ScheduleLike[] = []) {
    if (zone.zone_type !== 'schedule' || !zone.department_id) return []
    return schedules.filter(schedule => schedule.doctors?.department_id === zone.department_id)
}

function getScheduleAlignment(align?: string | null): CanvasTextAlign {
    if (align === 'left' || align === 'right') return align
    return 'center'
}

function getScheduleXRatio(align: CanvasTextAlign) {
    if (align === 'left') return 0
    if (align === 'right') return 1
    return 0.5
}

function splitDoctorNameNearMiddle(words: string[]) {
    // Keep medical specialty suffixes with the surname instead of isolating them.
    // Example: "dr. M. Satria Yudha Pratama, Sp.PD" ->
    // ["dr. M. Satria Yudha", "Pratama, Sp.PD"].
    return Math.max(2, words.length - 2)
}

function getLongestTextLine(lines: string[]) {
    return lines.reduce((longest, line) => line.length > longest.length ? line : longest, '')
}

function wrapDoctorNameForCard(name: string, columns: number) {
    if (columns <= 1) return [name]
    const words = name.trim().split(/\s+/).filter(Boolean)
    if (words.length <= 4 || name.length <= 24) return [name]
    const splitAt = splitDoctorNameNearMiddle(words)
    return [words.slice(0, splitAt).join(' '), words.slice(splitAt).join(' ')]
}

function withScheduleTypography(item: { time: string, name: string }, columns: number) {
    const nameLines = wrapDoctorNameForCard(item.name, columns)
    return {
        ...item,
        nameLines,
        nameFitText: getLongestTextLine(nameLines),
        timeFontScale: columns > 1 ? 0.94 : 1,
        nameFontScale: columns > 1 ? 0.9 : 0.92,
        lineGapRatio: columns > 1 ? 0.95 : 0.72,
    }
}

export function getZoneTextStyle(zone: TemplateZoneLike): ZoneTextStyle {
    if (zone.zone_type === 'date') {
        return { fontWeight: '700', lineHeightRatio: 1.75, letterSpacingEm: 0.08 }
    }
    return { fontWeight: '400', lineHeightRatio: 1.5, letterSpacingEm: 0 }
}

export function buildScheduleLayoutItems(zone: TemplateZoneLike, schedules: ScheduleLike[] = []): ScheduleLayoutItem[] {
    const matching = getSchedulesForZone(zone, schedules).map(schedule => ({
        time: formatScheduleTime(schedule.start_time, schedule.end_time),
        name: schedule.doctors?.name || 'Dokter',
    }))
    const layout = normalizeScheduleLayout(zone.schedule_layout)
    const zoneAlign = getScheduleAlignment(zone.text_align)
    const singleColumnXRatio = getScheduleXRatio(zoneAlign)

    if (layout === 'pr-card') {
        if (matching.length <= 1) {
            return matching.map(item => ({ ...withScheduleTypography(item, 1), xRatio: singleColumnXRatio, yRatio: 0.5, align: zoneAlign, columnWidthRatio: 0.92 }))
        }

        // Matches the green manual PR design: two doctors sit side-by-side inside the same white pill.
        // If there are more than two schedules, use two columns and multiple compact rows instead of overflowing.
        const columns = 2
        const rows = Math.ceil(matching.length / columns)
        return matching.map((item, index) => {
            const col = index % columns
            const row = Math.floor(index / columns)
            return {
                ...withScheduleTypography(item, columns),
                xRatio: col === 0 ? 0.25 : 0.75,
                yRatio: (row + 0.5) / rows,
                align: 'center' as CanvasTextAlign,
                columnWidthRatio: 0.42,
            }
        })
    }

    if (layout === 'pr-list') {
        // Matches the white manual PR design: bold time column on the left, doctor names aligned on the right.
        const rows = Math.max(1, matching.length)
        return matching.map((item, index) => ({
            ...withScheduleTypography(item, 1),
            timeXRatio: 0.06,
            nameXRatio: 0.38,
            yRatio: (index + 0.5) / rows,
            align: 'left' as CanvasTextAlign,
            columnWidthRatio: 0.5,
        }))
    }

    return matching.map((item, index) => ({
        ...withScheduleTypography(item, 1),
        xRatio: 0.5,
        yRatio: (index + 0.5) / Math.max(1, matching.length),
        align: 'center' as CanvasTextAlign,
        columnWidthRatio: 0.9,
    }))
}

export function getZoneLines(
    zone: TemplateZoneLike,
    schedules: ScheduleLike[] = [],
    exportDate: string,
    formatDate: (date: string) => string,
) {
    if (zone.zone_type === 'schedule' && zone.department_id) {
        return getSchedulesForZone(zone, schedules).map(schedule => {
            const doctorName = schedule.doctors?.name || 'Dokter'
            return `${doctorName} (${schedule.start_time.slice(0, 5)} - ${schedule.end_time.slice(0, 5)})`
        })
    }

    if (zone.zone_type === 'date') return [formatDate(exportDate).toUpperCase()]
    if (zone.zone_type === 'text' && zone.custom_text) return [zone.custom_text]
    return []
}

export function getCanvasDrawX(zone: TemplateZoneLike) {
    const x = zone.pos_x || 0
    const width = zone.width || 0

    if (zone.text_align === 'center') return x + width / 2
    if (zone.text_align === 'right') return x + width
    return x
}

export function getCanvasTextAlign(zone: TemplateZoneLike): CanvasTextAlign {
    if (zone.text_align === 'center' || zone.text_align === 'right') return zone.text_align
    return 'left'
}

function fitFontSize(ctx: CanvasRenderingContext2D, text: string, fontWeight: string, baseSize: number, family: string, maxWidth: number, minSize: number) {
    let size = baseSize
    while (size > minSize) {
        ctx.font = `${fontWeight} ${size}px "${family}"`
        if (ctx.measureText(text).width <= maxWidth) return size
        size -= 1
    }
    return minSize
}

function drawPrScheduleZone(ctx: CanvasRenderingContext2D, zone: TemplateZoneLike, schedules: ScheduleLike[]) {
    const x = zone.pos_x || 0
    const y = zone.pos_y || 0
    const width = zone.width || 0
    const height = zone.height || 0
    const baseFontSize = zone.font_size || 30
    const family = zone.font_family || DEFAULT_TEMPLATE_ZONE_FONT
    const items = buildScheduleLayoutItems(zone, schedules)
    if (items.length === 0) return

    const layout = normalizeScheduleLayout(zone.schedule_layout)
    const compactScale = items.length > 2 ? 0.82 : 1
    ctx.fillStyle = zone.font_color || '#00715f'
    ctx.textBaseline = 'middle'

    if (layout === 'pr-list') {
        const rowFont = Math.max(14, baseFontSize * compactScale)
        items.forEach(item => {
            const rowY = y + height * item.yRatio
            const timeX = x + width * (item.timeXRatio || 0.08)
            const nameX = x + width * (item.nameXRatio || 0.42)
            const timeMaxWidth = width * 0.28
            const nameMaxWidth = width * 0.52
            const timeSize = fitFontSize(ctx, item.time, '700', rowFont * item.timeFontScale, family, timeMaxWidth, 13)
            const nameSize = fitFontSize(ctx, item.nameFitText, '400', rowFont * item.nameFontScale, family, nameMaxWidth, 13)

            ctx.textAlign = 'left'
            ctx.font = `700 ${timeSize}px "${family}"`
            ctx.fillText(item.time, timeX, rowY)
            ctx.font = `400 ${nameSize}px "${family}"`
            ctx.fillText(item.name, nameX, rowY)
        })
        return
    }

    items.forEach(item => {
        const drawX = x + width * (item.xRatio ?? 0.5)
        const centerY = y + height * item.yRatio
        const maxTextWidth = width * (item.columnWidthRatio || 0.86)
        const timeSize = fitFontSize(ctx, item.time, '700', baseFontSize * compactScale * item.timeFontScale, family, maxTextWidth, 13)
        const nameSize = fitFontSize(ctx, item.nameFitText, '400', baseFontSize * compactScale * item.nameFontScale, family, maxTextWidth, 12)
        const lineGap = Math.max(16, timeSize * item.lineGapRatio)
        const nameLineHeight = Math.max(14, nameSize * 0.9)
        const nameLines = item.nameLines.length > 0 ? item.nameLines : [item.name]
        const totalNameHeight = nameLines.length * nameLineHeight
        const nameStartY = centerY + lineGap / 2 - totalNameHeight / 2 + nameLineHeight / 2

        ctx.textAlign = item.align
        ctx.font = `700 ${timeSize}px "${family}"`
        ctx.fillText(item.time, drawX, centerY - lineGap / 2)
        ctx.font = `400 ${nameSize}px "${family}"`
        nameLines.forEach((line, lineIndex) => {
            ctx.fillText(line, drawX, nameStartY + lineIndex * nameLineHeight)
        })
    })
}

function drawTextWithLetterSpacing(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, letterSpacing: number, align: CanvasTextAlign) {
    if (letterSpacing <= 0 || text.length <= 1) {
        ctx.fillText(text, x, y)
        return
    }

    const widths = Array.from(text).map(char => ctx.measureText(char).width)
    const totalWidth = widths.reduce((sum, width) => sum + width, 0) + letterSpacing * (widths.length - 1)
    let currentX = x
    if (align === 'center') currentX -= totalWidth / 2
    if (align === 'right' || align === 'end') currentX -= totalWidth

    const originalAlign = ctx.textAlign
    ctx.textAlign = 'left'
    Array.from(text).forEach((char, index) => {
        ctx.fillText(char, currentX, y)
        currentX += widths[index] + letterSpacing
    })
    ctx.textAlign = originalAlign
}

export function drawZoneToCanvas(
    ctx: CanvasRenderingContext2D,
    zone: TemplateZoneLike,
    schedules: ScheduleLike[],
    exportDate: string,
    formatDate: (date: string) => string,
) {
    const y = zone.pos_y || 0
    const height = zone.height || 0
    const fontSize = zone.font_size || 20
    const scheduleLayout = normalizeScheduleLayout(zone.schedule_layout)

    if (zone.zone_type === 'schedule' && scheduleLayout !== 'stacked') {
        drawPrScheduleZone(ctx, zone, schedules)
        return
    }

    const lines = getZoneLines(zone, schedules, exportDate, formatDate)
    if (lines.length === 0) return

    const textStyle = getZoneTextStyle(zone)
    ctx.font = `${textStyle.fontWeight} ${fontSize}px "${zone.font_family || DEFAULT_TEMPLATE_ZONE_FONT}"`
    ctx.fillStyle = zone.font_color || '#000000'
    ctx.textBaseline = 'middle'
    const textAlign = getCanvasTextAlign(zone)
    ctx.textAlign = textAlign

    const drawX = getCanvasDrawX(zone)
    const centerY = y + height / 2
    const lineHeight = fontSize * textStyle.lineHeightRatio
    const totalHeight = lines.length * lineHeight
    let currentY = centerY - totalHeight / 2 + lineHeight / 2

    lines.forEach(line => {
        drawTextWithLetterSpacing(ctx, line, drawX, currentY, fontSize * textStyle.letterSpacingEm, textAlign)
        currentY += lineHeight
    })
}
