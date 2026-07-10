import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Database } from '../../types/database.types'
import { ArrowLeft, Download, Plus, X, Copy, Eye, EyeOff, Type, Calendar as CalendarIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react'
import ErrorBoundary from '../../components/ErrorBoundary'

import { formatLongDateID, getLocalDateISOString } from '../../utils/dateUtils'
import { buildScheduleLayoutItems, DEFAULT_GRID_SIZE, drawZoneToCanvas, getCurrentExportDate, getZoneLabel, getZoneLines, getZoneTextStyle, snapValueToGrid } from '../../utils/templateZoneRendering'
import { DEFAULT_TEMPLATE_ZONE_FONT, TEMPLATE_ZONE_FONTS } from '../../utils/templateZoneFonts'
import { applyBulkZoneUpdates, commitZoneHistory, createPastedZonePayloads, getKeyboardMoveDelta, getNextSelectedZoneIds, moveSelectedZones, moveSelectedZonesByDrag, pickZonesForClipboard, redoZoneHistory, toZoneInsertPayload, undoZoneHistory, ZoneHistory } from '../../utils/templateZoneEditing'

type Template = Database['public']['Tables']['templates']['Row']
type Zone = Database['public']['Tables']['template_zones']['Row'] & {
    font_family?: string
    text_align?: 'left' | 'center' | 'right' | 'justify'
    zone_type?: 'schedule' | 'date' | 'text'
    custom_text?: string
    schedule_layout?: 'stacked' | 'pr-card' | 'pr-list'
}
type Department = Database['public']['Tables']['departments']['Row']
type ScheduleWithDoctor = Database['public']['Tables']['schedules']['Row'] & {
    doctors?: {
        name?: string | null
        department_id?: number | null
    } | null
}

function TemplateEditorContent() {
    const { id } = useParams<{ id: string }>()
    const [template, setTemplate] = useState<Template | null>(null)
    const [zones, setZones] = useState<Zone[]>([])
    const [departments, setDepartments] = useState<Department[]>([])
    const [previewSchedules, setPreviewSchedules] = useState<ScheduleWithDoctor[]>([])
    const [loading, setLoading] = useState(true)

    // Interaction State
    const [selectedZoneIds, setSelectedZoneIds] = useState<number[]>([])
    const [zoneClipboard, setZoneClipboard] = useState<Zone[]>([])
    const selectedZoneId = selectedZoneIds[selectedZoneIds.length - 1] ?? null
    const [isDragging, setIsDragging] = useState(false)
    const [isResizing, setIsResizing] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
    const [initialZoneState, setInitialZoneState] = useState<Partial<Zone> | null>(null)
    const [initialZoneStates, setInitialZoneStates] = useState<Zone[]>([])
    const historyRef = useRef<ZoneHistory<Zone>>({ past: [], present: [], future: [] })
    const [scale, setScale] = useState(1)
    const [isPreviewMode, setIsPreviewMode] = useState(false)

    // Snap State
    const [snapLines, setSnapLines] = useState<{ x?: number, y?: number }>({})
    const [showGrid, setShowGrid] = useState(false)
    const [snapToGrid, setSnapToGrid] = useState(true)

    // Export State
    const [exportDate, setExportDate] = useState(getLocalDateISOString())
    const [isExporting, setIsExporting] = useState(false)
    const [exportError, setExportError] = useState<string | null>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const imageRef = useRef<HTMLImageElement>(null)

    useEffect(() => {
        if (id && !isNaN(Number(id))) {
            fetchData(parseInt(id))
        } else {
            setLoading(false)
        }
    }, [id])

    useEffect(() => {
        fetchSchedulesForDate(exportDate).then(setPreviewSchedules).catch(err => {
            console.error('Error fetching preview schedules:', err)
            setPreviewSchedules([])
        })
    }, [exportDate])

    useEffect(() => {
        const updateScale = () => {
            if (imageRef.current) {
                const currentWidth = imageRef.current.width
                const naturalWidth = imageRef.current.naturalWidth
                if (currentWidth && naturalWidth) {
                    setScale(currentWidth / naturalWidth)
                }
            }
        }

        window.addEventListener('resize', updateScale)
        const interval = setInterval(updateScale, 1000)

        return () => {
            window.removeEventListener('resize', updateScale)
            clearInterval(interval)
        }
    }, [])

    const persistZoneSnapshot = async (nextZones: Zone[], previousZones: Zone[] = zones) => {
        const nextIds = new Set(nextZones.map(zone => zone.id))
        const previousIds = new Set(previousZones.map(zone => zone.id))

        await Promise.all(previousZones
            .filter(zone => !nextIds.has(zone.id))
            .map(zone => supabase.from('template_zones').delete().eq('id', zone.id)))

        await Promise.all(nextZones.map(zone => {
            if (previousIds.has(zone.id)) {
                return supabase.from('template_zones').update(zone as any).eq('id', zone.id)
            }
            return supabase.from('template_zones').insert([zone] as any)
        }))
    }

    const restoreHistorySnapshot = (direction: 'undo' | 'redo') => {
        setZones(prev => {
            const currentHistory = { ...historyRef.current, present: prev }
            const nextHistory = direction === 'undo' ? undoZoneHistory(currentHistory) : redoZoneHistory(currentHistory)
            if (nextHistory === currentHistory) return prev
            historyRef.current = nextHistory
            void persistZoneSnapshot(nextHistory.present, prev)
            setSelectedZoneIds(ids => ids.filter(id => nextHistory.present.some(zone => zone.id === id)))
            return nextHistory.present
        })
    }

    // Global mouse up handler
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isDragging || isResizing) {
                setIsDragging(false)
                setIsResizing(false)
                setSnapLines({})

                const idsToPersist = selectedZoneIds.length > 0 ? selectedZoneIds : selectedZoneId ? [selectedZoneId] : []
                if (idsToPersist.length > 0) {
                    void Promise.all(idsToPersist.map(zoneId => {
                        const zone = zones.find(z => z.id === zoneId)
                        if (!zone) return Promise.resolve()
                        return supabase.from('template_zones').update({
                            pos_x: zone.pos_x,
                            pos_y: zone.pos_y,
                            width: zone.width,
                            height: zone.height
                        } as any).eq('id', zoneId)
                    }))
                }
            }
        }

        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (!selectedZoneId || !containerRef.current || !imageRef.current) return

            const containerRect = containerRef.current.getBoundingClientRect()
            const mouseX = e.clientX - containerRect.left
            const mouseY = e.clientY - containerRect.top

            const currentScale = imageRef.current.width / imageRef.current.naturalWidth

            if (isDragging && initialZoneState) {
                const dx = (mouseX - dragStart.x) / currentScale
                const dy = (mouseY - dragStart.y) / currentScale

                let newX = (initialZoneState.pos_x || 0) + dx
                let newY = (initialZoneState.pos_y || 0) + dy

                // Snapping Logic: grid first for predictable placement, then nearby zone edges/centers.
                const SNAP_THRESHOLD = 10 / currentScale
                let snappedX = snapValueToGrid(newX, DEFAULT_GRID_SIZE, snapToGrid)
                let snappedY = snapValueToGrid(newY, DEFAULT_GRID_SIZE, snapToGrid)
                let activeSnapX: number | undefined = snapToGrid ? snappedX : undefined
                let activeSnapY: number | undefined = snapToGrid ? snappedY : undefined

                const currentWidth = initialZoneState.width || 0
                const currentHeight = initialZoneState.height || 0
                const cx = newX + currentWidth / 2
                const cy = newY + currentHeight / 2

                zones.forEach(z => {
                    if (z.id === selectedZoneId) return

                    const zx = z.pos_x || 0
                    const zy = z.pos_y || 0
                    const zw = z.width || 0
                    const zh = z.height || 0
                    const zcx = zx + zw / 2
                    const zcy = zy + zh / 2

                    if (Math.abs(newX - zx) < SNAP_THRESHOLD) { snappedX = zx; activeSnapX = zx; }
                    else if (Math.abs(newX - (zx + zw)) < SNAP_THRESHOLD) { snappedX = zx + zw; activeSnapX = zx + zw; }
                    else if (Math.abs(cx - zcx) < SNAP_THRESHOLD) { snappedX = zcx - currentWidth / 2; activeSnapX = zcx; }

                    if (Math.abs(newY - zy) < SNAP_THRESHOLD) { snappedY = zy; activeSnapY = zy; }
                    else if (Math.abs(newY - (zy + zh)) < SNAP_THRESHOLD) { snappedY = zy + zh; activeSnapY = zy + zh; }
                    else if (Math.abs(cy - zcy) < SNAP_THRESHOLD) { snappedY = zcy - currentHeight / 2; activeSnapY = zcy; }
                })

                setSnapLines({ x: activeSnapX, y: activeSnapY })

                const nextZones = moveSelectedZonesByDrag(
                    zones,
                    selectedZoneIds.length > 0 ? selectedZoneIds : [selectedZoneId],
                    selectedZoneId,
                    initialZoneStates.length > 0 ? initialZoneStates : [initialZoneState as Zone],
                    snappedX - (initialZoneState.pos_x || 0),
                    snappedY - (initialZoneState.pos_y || 0),
                    false,
                    DEFAULT_GRID_SIZE,
                ) as Zone[]

                setZones(nextZones)

            } else if (isResizing && initialZoneState) {
                const dx = (mouseX - dragStart.x) / currentScale
                const dy = (mouseY - dragStart.y) / currentScale

                const newWidth = snapValueToGrid(Math.max(50, (initialZoneState.width || 100) + dx), DEFAULT_GRID_SIZE, snapToGrid)
                const newHeight = snapValueToGrid(Math.max(30, (initialZoneState.height || 50) + dy), DEFAULT_GRID_SIZE, snapToGrid)

                setZones(prev => prev.map(z => z.id === selectedZoneId ? { ...z, width: Math.round(newWidth), height: Math.round(newHeight) } : z))
            }
        }

        window.addEventListener('mouseup', handleGlobalMouseUp)
        window.addEventListener('mousemove', handleGlobalMouseMove)

        return () => {
            window.removeEventListener('mouseup', handleGlobalMouseUp)
            window.removeEventListener('mousemove', handleGlobalMouseMove)
        }
    }, [isDragging, isResizing, selectedZoneId, dragStart, initialZoneState, zones, snapToGrid])


    useEffect(() => {
        const isEditableTarget = (target: EventTarget | null) => {
            const element = target as HTMLElement | null
            if (!element) return false
            return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isPreviewMode || isEditableTarget(e.target)) return

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault()
                restoreHistorySnapshot('undo')
                return
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault()
                restoreHistorySnapshot('redo')
                return
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                if (selectedZoneIds.length === 0) return
                e.preventDefault()
                setZoneClipboard(pickZonesForClipboard(zones, selectedZoneIds) as Zone[])
                return
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                if (!template || zoneClipboard.length === 0) return
                e.preventDefault()
                const payloads = zoneClipboard.map(zone => toZoneInsertPayload(zone, template.id, 20))
                void handlePasteZonePayloads(payloads)
                return
            }

            if (selectedZoneIds.length === 0) return

            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault()
                void handleDeleteSelectedZones()
                return
            }

            const delta = getKeyboardMoveDelta(e.key, e.shiftKey)
            if (delta) {
                e.preventDefault()
                const movedZones = moveSelectedZones(zones, selectedZoneIds, e.key, e.shiftKey) as Zone[]
                historyRef.current = commitZoneHistory({ ...historyRef.current, present: zones }, movedZones)
                setZones(movedZones)
                void Promise.all(selectedZoneIds.map(zoneId => {
                    const moved = movedZones.find(zone => zone.id === zoneId)
                    if (!moved) return Promise.resolve()
                    return supabase.from('template_zones').update({ pos_x: moved.pos_x, pos_y: moved.pos_y } as any).eq('id', zoneId)
                }))
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isPreviewMode, selectedZoneIds, zones, zoneClipboard, template])


    const fetchData = async (templateId: number) => {
        try {
            setLoading(true)
            const [tplRes, zonesRes, deptsRes, schedulesRes] = await Promise.all([
                supabase.from('templates').select('*').eq('id', templateId).single(),
                supabase.from('template_zones').select('*').eq('template_id', templateId),
                supabase.from('departments').select('*').order('name'),
                supabase.from('schedules').select('*, doctors(name, department_id)').eq('date', exportDate).order('start_time')
            ])

            if (tplRes.error) throw tplRes.error

            const fetchedZones = (zonesRes.data || []) as Zone[]
            setTemplate(tplRes.data)
            setZones(fetchedZones)
            historyRef.current = { past: [], present: fetchedZones, future: [] }
            setDepartments(deptsRes.data || [])
            setPreviewSchedules((schedulesRes.data as ScheduleWithDoctor[]) || [])
        } catch (err) {
            console.error('Error fetching data:', err)
        } finally {
            setLoading(false)
        }
    }

    const fetchSchedulesForDate = async (date: string) => {
        const { data, error } = await supabase
            .from('schedules')
            .select('*, doctors(name, department_id)')
            .eq('date', date)
            .order('start_time')

        if (error) throw error
        return ((data as ScheduleWithDoctor[]) || [])
    }

    const handleAddZone = async (type: 'schedule' | 'date' | 'text' = 'schedule') => {
        if (!template) return
        try {
            const { data, error } = await supabase
                .from('template_zones')
                // @ts-ignore
                .insert([{
                    template_id: template.id,
                    department_id: type === 'schedule' ? departments[0]?.id : null,
                    pos_x: 50,
                    pos_y: 50,
                    width: type === 'schedule' ? 500 : 420,
                    height: type === 'date' ? 70 : 80,
                    font_size: type === 'schedule' ? 32 : type === 'date' ? 28 : 20,
                    font_color: '#000000',
                    zone_type: type,
                    font_family: DEFAULT_TEMPLATE_ZONE_FONT,
                    text_align: 'left',
                    custom_text: type === 'text' ? 'Teks Kustom' : null,
                    schedule_layout: type === 'schedule' ? 'pr-card' : null
                }] as any)
                .select()
                .single()

            if (error) throw error
            const newZone = data as Zone
            const nextZones = [...zones, newZone]
            historyRef.current = commitZoneHistory({ ...historyRef.current, present: zones }, nextZones)
            setZones(nextZones)
            setSelectedZoneIds([newZone.id])
        } catch (err) {
            console.error('Error adding zone:', err)
        }
    }

    const handlePasteZonePayloads = async (payloads: ReturnType<typeof createPastedZonePayloads>) => {
        if (!template || payloads.length === 0) return
        try {
            const { data, error } = await supabase
                .from('template_zones')
                // @ts-ignore
                .insert(payloads as any)
                .select()

            if (error) throw error
            const newZones = (Array.isArray(data) ? data : [data]).filter(Boolean) as Zone[]
            const nextZones = [...zones, ...newZones]
            historyRef.current = commitZoneHistory({ ...historyRef.current, present: zones }, nextZones)
            setZones(nextZones)
            setSelectedZoneIds(newZones.map(zone => zone.id))
        } catch (err) {
            console.error('Error pasting zones:', err)
        }
    }

    const handleDuplicateSelectedZones = async () => {
        if (!template || selectedZoneIds.length === 0) return
        const payloads = createPastedZonePayloads(zones, selectedZoneIds, template.id)
        setZoneClipboard(pickZonesForClipboard(zones, selectedZoneIds) as Zone[])
        await handlePasteZonePayloads(payloads)
    }

    const handleUpdateZone = async (zoneId: number, updates: Partial<Zone>, recordHistory = true) => {
        const nextZones = zones.map(z => z.id === zoneId ? { ...z, ...updates } : z)
        if (recordHistory) historyRef.current = commitZoneHistory({ ...historyRef.current, present: zones }, nextZones)
        setZones(nextZones)
        try {
            // @ts-ignore
            await supabase.from('template_zones').update(updates as any).eq('id', zoneId)
        } catch (err) {
            console.error('Error updating zone:', err)
        }
    }

    const handleDeleteSelectedZones = async () => {
        if (selectedZoneIds.length === 0) return
        const idsToDelete = [...selectedZoneIds]
        try {
            await Promise.all(idsToDelete.map(zoneId => supabase.from('template_zones').delete().eq('id', zoneId)))
            const nextZones = zones.filter(z => !idsToDelete.includes(z.id))
            historyRef.current = commitZoneHistory({ ...historyRef.current, present: zones }, nextZones)
            setZones(nextZones)
            setSelectedZoneIds([])
        } catch (err) {
            console.error('Error deleting selected zones:', err)
        }
    }

    const handleBulkUpdateZones = async (updates: Partial<Zone>) => {
        const idsToUpdate = selectedZoneIds.length > 0 ? [...selectedZoneIds] : selectedZoneId ? [selectedZoneId] : []
        if (idsToUpdate.length === 0) return
        const nextZones = applyBulkZoneUpdates(zones, idsToUpdate, updates) as Zone[]
        historyRef.current = commitZoneHistory({ ...historyRef.current, present: zones }, nextZones)
        setZones(nextZones)
        try {
            await Promise.all(idsToUpdate.map(zoneId => supabase.from('template_zones').update(updates as any).eq('id', zoneId)))
        } catch (err) {
            console.error('Error bulk updating zones:', err)
        }
    }

    const handleMouseDown = (e: React.MouseEvent, zone: Zone, type: 'drag' | 'resize') => {
        if (isPreviewMode) return
        e.preventDefault()
        e.stopPropagation()

        if (!containerRef.current) return
        const containerRect = containerRef.current.getBoundingClientRect()

        const isAdditiveSelection = e.ctrlKey || e.metaKey
        const nextSelectedZoneIds = !isAdditiveSelection && selectedZoneIds.includes(zone.id) && selectedZoneIds.length > 1
            ? selectedZoneIds
            : getNextSelectedZoneIds(selectedZoneIds, zone.id, isAdditiveSelection)
        setSelectedZoneIds(nextSelectedZoneIds)
        if (isAdditiveSelection) return

        setDragStart({ x: e.clientX - containerRect.left, y: e.clientY - containerRect.top })
        setInitialZoneState({ ...zone })
        setInitialZoneStates(zones.filter(z => nextSelectedZoneIds.includes(z.id)))
        historyRef.current = commitZoneHistory({ ...historyRef.current, present: zones }, zones)

        if (type === 'drag') setIsDragging(true)
        else setIsResizing(true)
    }

    const handleExport = async () => {
        if (!template?.background_image_url || !canvasRef.current) return
        setIsExporting(true)
        setExportError(null)

        try {
            const canvas = canvasRef.current
            const ctx = canvas.getContext('2d')
            if (!ctx) return

            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = template.background_image_url

            await new Promise((resolve, reject) => {
                img.onload = resolve
                img.onerror = reject
            })

            canvas.width = img.width
            canvas.height = img.height
            ctx.drawImage(img, 0, 0)

            const chosenExportDate = getCurrentExportDate(getLocalDateISOString, exportDate)
            const schedulesAny = await fetchSchedulesForDate(chosenExportDate)
            setPreviewSchedules(schedulesAny)

            if ('fonts' in document) {
                await Promise.all(Array.from(new Set(zones.map(zone => zone.font_family || DEFAULT_TEMPLATE_ZONE_FONT))).map(font => document.fonts.load(`16px "${font}"`)))
            }

            zones.forEach(zone => {
                drawZoneToCanvas(ctx, zone, schedulesAny, chosenExportDate, formatLongDateID)
            })

            const link = document.createElement('a')
            link.download = `schedule-${chosenExportDate}.png`
            link.href = canvas.toDataURL('image/png')
            link.click()

        } catch (err) {
            console.error('Export failed:', err)
            setExportError('Export gagal. Silakan coba lagi.')
        } finally {
            setIsExporting(false)
        }
    }

    const selectedZone = zones.find(z => z.id === selectedZoneId)

    if (!id || isNaN(parseInt(id))) return <div className="p-8 text-center text-slate-500">Invalid Template ID</div>
    if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>
    if (!template) return <div className="p-8 text-center text-slate-500">Template not found</div>

    return (
        <div className="flex h-[calc(100vh-4rem)] flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center">
                    <Link to="/pr" className="mr-4 text-slate-500 hover:text-slate-700">
                        <ArrowLeft className="h-6 w-6" />
                    </Link>
                    <h1 className="text-xl font-bold text-slate-800">{template.name}</h1>
                </div>
                <div className="flex items-center space-x-4">
                    <button
                        onClick={() => setIsPreviewMode(!isPreviewMode)}
                        className={`btn ${isPreviewMode ? 'bg-blue-100 text-blue-700' : 'btn-secondary'}`}
                    >
                        {isPreviewMode ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                        {isPreviewMode ? 'Mode Edit' : 'Pratinjau'}
                    </button>
                    <div className="flex items-center">
                        <span className="mr-2 text-sm text-slate-600">Tanggal Pratinjau:</span>
                        <input
                            type="date"
                            value={exportDate}
                            onChange={e => setExportDate(e.target.value)}
                            className="input py-1 text-sm w-auto"
                        />
                    </div>
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="btn btn-primary bg-green-600 hover:bg-green-700 focus:ring-green-600"
                    >
                        <Download className="mr-2 h-4 w-4" />
                        {isExporting ? 'Memproses...' : 'Ekspor Gambar'}
                    </button>
                </div>
            </div>
            {exportError && (
                <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
                    {exportError}
                </div>
            )}

            {/* Main Area */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar Controls */}
                {!isPreviewMode && (
                    <div className="w-80 overflow-y-auto border-r border-slate-200 bg-white p-4">
                        <div className="mb-4">
                            <h2 className="font-semibold text-slate-700 mb-2">Tambah Zona</h2>
                            <div className="flex gap-2">
                                <button onClick={() => handleAddZone('schedule')} className="btn btn-sm btn-secondary flex-1" title="Zona Jadwal">
                                    <Plus className="h-4 w-4 mr-1" /> Jadwal
                                </button>
                                <button onClick={() => handleAddZone('date')} className="btn btn-sm btn-secondary flex-1" title="Zona Tanggal">
                                    <CalendarIcon className="h-4 w-4 mr-1" /> Tgl
                                </button>
                                <button onClick={() => handleAddZone('text')} className="btn btn-sm btn-secondary flex-1" title="Zona Teks">
                                    <Type className="h-4 w-4 mr-1" /> Teks
                                </button>
                            </div>
                        </div>

                        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <h2 className="mb-2 font-semibold text-slate-700">Tampilan & Snap</h2>
                            <label className="mb-2 flex items-center justify-between text-sm text-slate-600">
                                <span>Tampilkan grid {DEFAULT_GRID_SIZE}px</span>
                                <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
                            </label>
                            <label className="flex items-center justify-between text-sm text-slate-600">
                                <span>Snap ke grid</span>
                                <input type="checkbox" checked={snapToGrid} onChange={e => setSnapToGrid(e.target.checked)} />
                            </label>
                        </div>

                        <div className="mb-4">
                            <h2 className="mb-2 font-semibold text-slate-700">Daftar Zona</h2>
                            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1">
                                {zones.length === 0 && <div className="p-2 text-xs text-slate-400">Belum ada zona.</div>}
                                {zones.map(zone => (
                                    <button
                                        key={zone.id}
                                        type="button"
                                        onClick={(e) => setSelectedZoneIds(getNextSelectedZoneIds(selectedZoneIds, zone.id, e.ctrlKey || e.metaKey))}
                                        className={`w-full rounded px-2 py-2 text-left text-sm transition ${selectedZoneIds.includes(zone.id) ? 'bg-blue-100 text-blue-800' : 'text-slate-600 hover:bg-slate-100'}`}
                                    >
                                        <div className="font-medium">{getZoneLabel(zone, departments)}</div>
                                        <div className="text-xs opacity-70">{zone.zone_type || 'zone'} · x:{zone.pos_x || 0} y:{zone.pos_y || 0} · {zone.width || 0}×{zone.height || 0}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {selectedZone && (
                            <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <h3 className="font-medium text-blue-900">{selectedZoneIds.length > 1 ? `Edit ${selectedZoneIds.length} Zona` : `Edit Zona #${selectedZone.id}`}</h3>
                                    <div className="flex gap-1">
                                        <button onClick={handleDuplicateSelectedZones} className="p-1 text-blue-600 hover:text-blue-800" title="Salin">
                                            <Copy className="h-4 w-4" />
                                        </button>
                                        <button onClick={handleDeleteSelectedZones} className="p-1 text-red-600 hover:text-red-800" title="Hapus">
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3 text-sm">
                                    {selectedZone.zone_type === 'schedule' && (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-xs font-medium text-slate-500 mb-1">Poliklinik</label>
                                                <select
                                                    value={selectedZone.department_id || ''}
                                                    onChange={e => handleUpdateZone(selectedZone.id, { department_id: parseInt(e.target.value) })}
                                                    className="input py-1 text-sm"
                                                >
                                                    <option value="">Pilih Poliklinik</option>
                                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-slate-500 mb-1">Template Nama & Jadwal</label>
                                                <select
                                                    value={selectedZone.schedule_layout || 'pr-card'}
                                                    onChange={e => handleBulkUpdateZones({ schedule_layout: e.target.value as Zone['schedule_layout'] })}
                                                    className="input py-1 text-sm"
                                                >
                                                    <option value="pr-card">HUMAS vertikal: waktu di atas nama, 1 dokter tengah / 2 dokter kiri-kanan</option>
                                                    <option value="pr-list">HUMAS horizontal: kolom waktu kiri, nama kanan</option>
                                                    <option value="stacked">Lama: nama (jam)</option>
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    {selectedZone.zone_type === 'text' && (
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Teks Kustom</label>
                                            <input
                                                type="text"
                                                value={selectedZone.custom_text || ''}
                                                onChange={e => handleUpdateZone(selectedZone.id, { custom_text: e.target.value })}
                                                className="input py-1 text-sm"
                                            />
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Font</label>
                                            <select
                                                value={selectedZone.font_family || DEFAULT_TEMPLATE_ZONE_FONT}
                                                onChange={e => handleBulkUpdateZones({ font_family: e.target.value })}
                                                className="input py-1 text-sm"
                                            >
                                                {TEMPLATE_ZONE_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Ukuran</label>
                                            <input type="number" value={selectedZone.font_size || 16} onChange={e => handleBulkUpdateZones({ font_size: parseInt(e.target.value) })} className="input py-1 text-sm" />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Perataan</label>
                                        <div className="flex rounded border bg-white">
                                            {['left', 'center', 'right', 'justify'].map((align) => (
                                                <button
                                                    key={align}
                                                    onClick={() => handleBulkUpdateZones({ text_align: align as any })}
                                                    className={`flex-1 p-1 hover:bg-slate-100 ${selectedZone.text_align === align ? 'bg-blue-100 text-blue-600' : 'text-slate-500'}`}
                                                >
                                                    {align === 'left' && <AlignLeft className="mx-auto h-4 w-4" />}
                                                    {align === 'center' && <AlignCenter className="mx-auto h-4 w-4" />}
                                                    {align === 'right' && <AlignRight className="mx-auto h-4 w-4" />}
                                                    {align === 'justify' && <AlignJustify className="mx-auto h-4 w-4" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">X</label>
                                            <input type="number" value={selectedZone.pos_x || 0} onChange={e => handleUpdateZone(selectedZone.id, { pos_x: parseInt(e.target.value) || 0 })} className="input py-1 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Y</label>
                                            <input type="number" value={selectedZone.pos_y || 0} onChange={e => handleUpdateZone(selectedZone.id, { pos_y: parseInt(e.target.value) || 0 })} className="input py-1 text-sm" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Lebar</label>
                                            <input type="number" value={selectedZone.width || 0} onChange={e => handleUpdateZone(selectedZone.id, { width: parseInt(e.target.value) || 0 })} className="input py-1 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Tinggi</label>
                                            <input type="number" value={selectedZone.height || 0} onChange={e => handleUpdateZone(selectedZone.id, { height: parseInt(e.target.value) || 0 })} className="input py-1 text-sm" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Warna</label>
                                            <input type="color" value={selectedZone.font_color || '#000000'} onChange={e => handleBulkUpdateZones({ font_color: e.target.value })} className="input py-1 text-sm h-8 p-0" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                            <div className="mb-2 font-medium text-slate-600">Shortcut editor</div>
                            <ul className="list-disc space-y-1 pl-4">
                                <li>Pilih zona untuk mengedit.</li>
                                <li>Ctrl+klik untuk multi-select.</li>
                                <li>Drag salah satu zona terpilih untuk geser bersama.</li>
                                <li>Panah untuk geser 1px; Shift+panah untuk 10px.</li>
                                <li>Delete/Backspace untuk hapus.</li>
                                <li>Ctrl+C/Ctrl+V untuk salin-tempel.</li>
                                <li>Ctrl+Z/Ctrl+Y untuk undo-redo.</li>
                            </ul>
                        </div>
                    </div>
                )}

                {/* Canvas / Preview Area */}
                <div className={`flex-1 overflow-auto bg-slate-100 p-8 ${isPreviewMode ? 'flex items-center justify-center' : ''}`}>
                    <div
                        ref={containerRef}
                        className="relative mx-auto bg-white shadow-xl ring-1 ring-slate-900/5 select-none"
                        style={{ width: 'fit-content' }}
                    >
                        {template.background_image_url && (
                            <div className="relative">
                                <img
                                    ref={imageRef}
                                    src={template.background_image_url}
                                    alt="Background"
                                    className="max-w-full block"
                                    style={{ maxHeight: '80vh' }}
                                    draggable={false}
                                    onLoad={() => {
                                        if (imageRef.current) {
                                            setScale(imageRef.current.width / imageRef.current.naturalWidth)
                                        }
                                    }}
                                />

                                {!isPreviewMode && showGrid && (
                                    <div
                                        className="pointer-events-none absolute inset-0 z-10 opacity-40"
                                        style={{
                                            backgroundImage: 'linear-gradient(to right, rgba(59,130,246,0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(59,130,246,0.35) 1px, transparent 1px)',
                                            backgroundSize: `${DEFAULT_GRID_SIZE * scale}px ${DEFAULT_GRID_SIZE * scale}px`,
                                        }}
                                    />
                                )}

                                {/* Snap Lines */}
                                {!isPreviewMode && snapLines.x !== undefined && (
                                    <div
                                        className="absolute top-0 bottom-0 border-l border-red-500 z-50"
                                        style={{ left: snapLines.x * scale }}
                                    />
                                )}
                                {!isPreviewMode && snapLines.y !== undefined && (
                                    <div
                                        className="absolute left-0 right-0 border-t border-red-500 z-50"
                                        style={{ top: snapLines.y * scale }}
                                    />
                                )}

                                {/* Overlay Zones */}
                                {zones.map(zone => {
                                    const isSelected = selectedZoneIds.includes(zone.id) && !isPreviewMode
                                    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1

                                    const previewLines = getZoneLines(zone, previewSchedules, exportDate, formatLongDateID)
                                    const effectiveScheduleLayout = zone.schedule_layout || 'pr-card'
                                    const previewScheduleItems = zone.zone_type === 'schedule' && effectiveScheduleLayout !== 'stacked'
                                        ? buildScheduleLayoutItems({ ...zone, schedule_layout: effectiveScheduleLayout }, previewSchedules)
                                        : []
                                    const zoneTextStyle = getZoneTextStyle(zone)

                                    return (
                                        <div
                                            key={zone.id}
                                            className="absolute group z-20"
                                            style={{
                                                left: (zone.pos_x || 0) * safeScale,
                                                top: (zone.pos_y || 0) * safeScale,
                                                width: (zone.width || 150) * safeScale,
                                                height: (zone.height || 80) * safeScale,
                                                cursor: !isPreviewMode ? (isDragging ? 'grabbing' : 'grab') : 'default',
                                            }}
                                            onMouseDown={(e) => handleMouseDown(e, zone, 'drag')}
                                        >
                                            {!isPreviewMode && (
                                                <span className="absolute -top-6 left-0 rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white shadow-sm whitespace-nowrap z-20 pointer-events-none">
                                                    {getZoneLabel(zone, departments)}
                                                </span>
                                            )}

                                            <div
                                                className={`w-full h-full transition-colors ${!isPreviewMode
                                                    ? (isSelected ? 'border-2 border-blue-600 bg-blue-500/10' : 'border-2 border-blue-400/60 bg-white/10 hover:border-blue-500 hover:bg-blue-500/10')
                                                    : ''
                                                    }`}
                                                style={{
                                                    fontFamily: zone.font_family || DEFAULT_TEMPLATE_ZONE_FONT,
                                                    fontSize: (zone.font_size || 16) * safeScale,
                                                    color: zone.font_color || '#000000',
                                                    textAlign: zone.text_align || 'left',
                                                    fontWeight: zoneTextStyle.fontWeight,
                                                    lineHeight: zoneTextStyle.lineHeightRatio,
                                                    letterSpacing: `${zoneTextStyle.letterSpacingEm}em`,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    justifyContent: 'center',
                                                    overflow: 'hidden'
                                                }}
                                            >
                                                {(
                                                    <div className="relative h-full w-full pointer-events-none">
                                                        {previewScheduleItems.length > 0 ? (
                                                            effectiveScheduleLayout === 'pr-list' ? (
                                                                previewScheduleItems.map((item, index) => (
                                                                    <div
                                                                        key={`${zone.id}-layout-${index}`}
                                                                        className="absolute flex w-full items-center"
                                                                        style={{ top: `${item.yRatio * 100}%`, transform: 'translateY(-50%)' }}
                                                                    >
                                                                        <span
                                                                            className="font-bold leading-none"
                                                                            style={{ marginLeft: `${(item.timeXRatio ?? 0.06) * 100}%`, width: '28%', fontSize: `${item.timeFontScale}em` }}
                                                                        >
                                                                            {item.time}
                                                                        </span>
                                                                        <span style={{ marginLeft: '4%', width: '58%', fontSize: `${item.nameFontScale}em`, lineHeight: 1.05 }}>
                                                                            {(item.nameLines?.length ? item.nameLines : [item.name]).map((line, lineIndex) => <span key={lineIndex} className="block">{line}</span>)}
                                                                        </span>
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                previewScheduleItems.map((item, index) => (
                                                                    <div
                                                                        key={`${zone.id}-layout-${index}`}
                                                                        className="absolute text-center"
                                                                        style={{
                                                                            left: `${(item.xRatio ?? 0.5) * 100}%`,
                                                                            top: `${item.yRatio * 100}%`,
                                                                            width: `${(item.columnWidthRatio || 0.42) * 100}%`,
                                                                            transform: item.align === 'left' ? 'translate(0, -50%)' : item.align === 'right' ? 'translate(-100%, -50%)' : 'translate(-50%, -50%)',
                                                                            textAlign: item.align,
                                                                        }}
                                                                    >
                                                                        <div className="font-bold leading-none" style={{ fontSize: `${item.timeFontScale}em` }}>{item.time}</div>
                                                                        <div className="leading-tight" style={{ fontSize: `${item.nameFontScale}em`, marginTop: `${item.lineGapRatio * 0.2}em` }}>
                                                                            {(item.nameLines?.length ? item.nameLines : [item.name]).map((line, lineIndex) => <span key={lineIndex} className="block">{line}</span>)}
                                                                        </div>
                                                                    </div>
                                                                ))
                                                            )
                                                        ) : previewLines.length > 0 ? (
                                                            <div className="flex h-full w-full flex-col justify-center">
                                                                {previewLines.map((line, index) => <div key={`${zone.id}-${index}`}>{line}</div>)}
                                                            </div>
                                                        ) : <span className="opacity-40">Tidak ada data</span>}
                                                    </div>
                                                )}
                                            </div>

                                            {isSelected && selectedZoneId === zone.id && (
                                                <div
                                                    className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize bg-blue-600 hover:bg-blue-700 z-20"
                                                    onMouseDown={(e) => handleMouseDown(e, zone, 'resize')}
                                                />
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Hidden Canvas for Export */}
            <canvas ref={canvasRef} className="hidden" />
        </div>
    )
}

export default function TemplateEditor() {
    return (
        <ErrorBoundary>
            <TemplateEditorContent />
        </ErrorBoundary>
    )
}
