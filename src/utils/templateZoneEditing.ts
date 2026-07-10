export type EditableTemplateZone = {
    id: number
    template_id?: number | null
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
    schedule_layout?: string | null
}

export type ZoneInsertPayload = Omit<EditableTemplateZone, 'id'> & { template_id: number }

export type ZoneHistory<T extends EditableTemplateZone> = {
    past: T[][]
    present: T[]
    future: T[][]
}

export const PASTED_ZONE_OFFSET = 20
export const KEYBOARD_MOVE_STEP = 1
export const KEYBOARD_MOVE_STEP_FAST = 10

export function getNextSelectedZoneIds(currentIds: number[], clickedId: number, additive = false) {
    if (!additive) return [clickedId]
    if (currentIds.includes(clickedId)) return currentIds.filter(id => id !== clickedId)
    return [...currentIds, clickedId]
}

export function getKeyboardMoveDelta(key: string, accelerated = false) {
    const step = accelerated ? KEYBOARD_MOVE_STEP_FAST : KEYBOARD_MOVE_STEP
    if (key === 'ArrowLeft') return { dx: -step, dy: 0 }
    if (key === 'ArrowRight') return { dx: step, dy: 0 }
    if (key === 'ArrowUp') return { dx: 0, dy: -step }
    if (key === 'ArrowDown') return { dx: 0, dy: step }
    return null
}

export function moveSelectedZones<T extends EditableTemplateZone>(zones: T[], selectedIds: number[], key: string, accelerated = false): T[] {
    const delta = getKeyboardMoveDelta(key, accelerated)
    if (!delta || selectedIds.length === 0) return zones
    const selected = new Set(selectedIds)

    return zones.map(zone => {
        if (!selected.has(zone.id)) return zone
        return {
            ...zone,
            pos_x: (zone.pos_x || 0) + delta.dx,
            pos_y: (zone.pos_y || 0) + delta.dy,
        }
    })
}

export function moveSelectedZonesByDrag<T extends EditableTemplateZone>(
    zones: T[],
    selectedIds: number[],
    activeZoneId: number,
    initialZones: T[],
    dx: number,
    dy: number,
    snapToGrid = false,
    gridSize = 10,
): T[] {
    if (selectedIds.length === 0) return zones
    const selected = new Set(selectedIds)
    const initialById = new Map(initialZones.map(zone => [zone.id, zone]))
    const activeInitial = initialById.get(activeZoneId)
    if (!activeInitial) return zones

    const snap = (value: number) => snapToGrid && gridSize > 0 ? Math.round(value / gridSize) * gridSize : Math.round(value)
    const activeStartX = activeInitial.pos_x || 0
    const activeStartY = activeInitial.pos_y || 0
    const snappedDx = snap(activeStartX + dx) - activeStartX
    const snappedDy = snap(activeStartY + dy) - activeStartY

    return zones.map(zone => {
        if (!selected.has(zone.id)) return zone
        const initial = initialById.get(zone.id) || zone
        return {
            ...zone,
            pos_x: (initial.pos_x || 0) + snappedDx,
            pos_y: (initial.pos_y || 0) + snappedDy,
        }
    })
}

export function applyBulkZoneUpdates<T extends EditableTemplateZone>(zones: T[], selectedIds: number[], updates: Partial<T>): T[] {
    if (selectedIds.length === 0) return zones
    const selected = new Set(selectedIds)
    return zones.map(zone => selected.has(zone.id) ? { ...zone, ...updates } : zone)
}

function cloneZones<T extends EditableTemplateZone>(zones: T[]): T[] {
    return zones.map(zone => ({ ...zone }))
}

export function commitZoneHistory<T extends EditableTemplateZone>(history: ZoneHistory<T>, nextZones: T[]): ZoneHistory<T> {
    return {
        past: [...history.past, cloneZones(history.present)],
        present: cloneZones(nextZones),
        future: [],
    }
}

export function undoZoneHistory<T extends EditableTemplateZone>(history: ZoneHistory<T>): ZoneHistory<T> {
    if (history.past.length === 0) return history
    const previous = history.past[history.past.length - 1]
    return {
        past: history.past.slice(0, -1),
        present: cloneZones(previous),
        future: [cloneZones(history.present), ...history.future],
    }
}

export function redoZoneHistory<T extends EditableTemplateZone>(history: ZoneHistory<T>): ZoneHistory<T> {
    if (history.future.length === 0) return history
    const next = history.future[0]
    return {
        past: [...history.past, cloneZones(history.present)],
        present: cloneZones(next),
        future: history.future.slice(1),
    }
}

export function pickZonesForClipboard<T extends EditableTemplateZone>(zones: T[], selectedIds: number[]) {
    const selected = new Set(selectedIds)
    return zones.filter(zone => selected.has(zone.id)).map(zone => ({ ...zone }))
}

export function toZoneInsertPayload(zone: EditableTemplateZone, templateId: number, offset = 0): ZoneInsertPayload {
    return {
        template_id: templateId,
        department_id: zone.department_id ?? null,
        pos_x: (zone.pos_x || 0) + offset,
        pos_y: (zone.pos_y || 0) + offset,
        width: zone.width ?? null,
        height: zone.height ?? null,
        font_size: zone.font_size ?? null,
        font_color: zone.font_color ?? null,
        font_family: zone.font_family ?? null,
        text_align: zone.text_align ?? null,
        zone_type: zone.zone_type ?? null,
        custom_text: zone.custom_text ?? null,
        schedule_layout: zone.schedule_layout ?? null,
    }
}

export function createPastedZonePayloads(zones: EditableTemplateZone[], selectedIds: number[], templateId: number, offset = PASTED_ZONE_OFFSET) {
    return pickZonesForClipboard(zones, selectedIds).map(zone => toZoneInsertPayload(zone, templateId, offset))
}
