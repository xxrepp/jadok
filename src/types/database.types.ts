export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string
                    username: string | null
                    role: 'HUMAS' | 'PERAWAT' | null
                    email: string | null
                }
                Insert: {
                    id: string
                    username?: string | null
                    role?: 'HUMAS' | 'PERAWAT' | null
                    email?: string | null
                }
                Update: {
                    id?: string
                    username?: string | null
                    role?: 'HUMAS' | 'PERAWAT' | null
                    email?: string | null
                }
            }
            departments: {
                Row: {
                    id: number
                    name: string
                }
                Insert: {
                    id?: never
                    name: string
                }
                Update: {
                    id?: never
                    name?: string
                }
            }
            doctors: {
                Row: {
                    id: number
                    name: string
                    department_id: number | null
                }
                Insert: {
                    id?: never
                    name: string
                    department_id?: number | null
                }
                Update: {
                    id?: never
                    name?: string
                    department_id?: number | null
                }
            }
            schedules: {
                Row: {
                    id: number
                    doctor_id: number | null
                    date: string
                    start_time: string
                    end_time: string
                    created_by: string | null
                }
                Insert: {
                    id?: never
                    doctor_id?: number | null
                    date: string
                    start_time: string
                    end_time: string
                    created_by?: string | null
                }
                Update: {
                    id?: never
                    doctor_id?: number | null
                    date?: string
                    start_time?: string
                    end_time?: string
                    created_by?: string | null
                }
            }
            templates: {
                Row: {
                    id: number
                    name: string | null
                    background_image_url: string | null
                    is_active: boolean | null
                    is_archived: boolean | null
                    created_at: string
                    created_by: string | null
                }
                Insert: {
                    id?: never
                    name?: string | null
                    background_image_url?: string | null
                    is_active?: boolean | null
                    is_archived?: boolean | null
                    created_at?: string
                    created_by?: string | null
                }
                Update: {
                    id?: never
                    name?: string | null
                    background_image_url?: string | null
                    is_active?: boolean | null
                    is_archived?: boolean | null
                    created_at?: string
                    created_by?: string | null
                }
            }
            template_zones: {
                Row: {
                    id: number
                    template_id: number | null
                    department_id: number | null
                    pos_x: number | null
                    pos_y: number | null
                    font_color: string | null
                    font_size: number | null
                    width: number | null
                    height: number | null
                    font_family: string | null
                    text_align: string | null
                    zone_type: string | null
                    custom_text: string | null
                    schedule_layout: string | null
                }
                Insert: {
                    id?: never
                    template_id?: number | null
                    department_id?: number | null
                    pos_x?: number | null
                    pos_y?: number | null
                    font_color?: string | null
                    font_size?: number | null
                    width?: number | null
                    height?: number | null
                    font_family?: string | null
                    text_align?: string | null
                    zone_type?: string | null
                    custom_text?: string | null
                    schedule_layout?: string | null
                }
                Update: {
                    id?: never
                    template_id?: number | null
                    department_id?: number | null
                    pos_x?: number | null
                    pos_y?: number | null
                    font_color?: string | null
                    font_size?: number | null
                    width?: number | null
                    height?: number | null
                    font_family?: string | null
                    text_align?: string | null
                    zone_type?: string | null
                    custom_text?: string | null
                    schedule_layout?: string | null
                }
            }
        }
    }
}
