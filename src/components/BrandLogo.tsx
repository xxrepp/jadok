type BrandLogoProps = {
    variant?: 'brand' | 'icon'
    className?: string
    imageClassName?: string
}

const BRAND_LOGO = '/assets/jadok%20logo.png'
const ICON_LOGO = '/assets/jadok%20small%20logo.png'

export default function BrandLogo({ variant = 'brand', className = '', imageClassName = '' }: BrandLogoProps) {
    if (variant === 'icon') {
        return (
            <span className={`inline-flex items-center justify-center overflow-hidden rounded-2xl bg-white p-1 ${className}`}>
                <img
                    src={ICON_LOGO}
                    alt="JADOK"
                    className={`h-full w-full object-contain scale-[2.35] ${imageClassName}`}
                    draggable={false}
                />
            </span>
        )
    }

    return (
        <span className={`inline-flex overflow-hidden bg-white ${className}`}>
            <img
                src={BRAND_LOGO}
                alt="JADOK"
                className={`h-full w-full object-contain scale-[2.45] ${imageClassName}`}
                draggable={false}
            />
        </span>
    )
}
