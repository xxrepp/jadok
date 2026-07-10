type CreditMarkProps = {
    variant?: 'light' | 'dark'
    className?: string
}

export default function CreditMark({ variant = 'light', className = '' }: CreditMarkProps) {
    const isDark = variant === 'dark'

    return (
        <div className={`flex items-center justify-center ${className}`}>
            <div className={`group inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.18em] shadow-sm backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 ${isDark
                ? 'border-white/20 bg-white/10 text-white/70 hover:bg-white/15 hover:text-white'
                : 'border-teal-100/80 bg-white/65 text-slate-400 hover:border-teal-200 hover:bg-white hover:text-teal-700'
                }`}>
                <span>Ⓒ</span>
                <span className={isDark ? 'text-white' : 'text-slate-800'}>xxrepp</span>
            </div>
        </div>
    )
}
