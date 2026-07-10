/**
 * Returns the current date in YYYY-MM-DD format based on the local timezone.
 * This fixes the issue where new Date().toISOString() returns UTC date which might be yesterday.
 */
export const getLocalDateISOString = (): string => {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export const toMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number)
    return (hours * 60) + minutes
}

export const isValidTimeRange = (startTime: string, endTime: string): boolean => {
    return toMinutes(startTime) < toMinutes(endTime)
}

export const formatLongDateID = (dateISO: string): string => {
    return new Date(dateISO).toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    })
}
