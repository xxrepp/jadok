import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { LocalSession, LocalUser, supabase } from '../lib/supabase'
import { Database } from '../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

interface AuthContextType {
    session: LocalSession | null
    user: LocalUser | null
    profile: Profile | null
    loading: boolean
    authError: string | null
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<LocalSession | null>(null)
    const [user, setUser] = useState<LocalUser | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true)
    const [authError, setAuthError] = useState<string | null>(null)

    const fetchProfile = useCallback(async (userId: string) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single()

        if (error) {
            setProfile(null)
            setAuthError('Gagal memuat profil pengguna.')
            return
        }

        setProfile(data)
        setAuthError(null)
    }, [])

    useEffect(() => {
        let isMounted = true

        const bootstrap = async () => {
            try {
                const { data: { session: currentSession } } = await supabase.auth.getSession()
                if (!isMounted) return

                setSession(currentSession)
                setUser(currentSession?.user ?? null)

                if (currentSession?.user) {
                    await fetchProfile(currentSession.user.id)
                } else {
                    setProfile(null)
                    setAuthError(null)
                }
            } catch (error) {
                if (!isMounted) return
                setAuthError('Terjadi kesalahan saat memuat sesi.')
                setProfile(null)
            } finally {
                if (isMounted) setLoading(false)
            }
        }

        void bootstrap()

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!isMounted) return
            setSession(session)
            setUser(session?.user ?? null)
            setLoading(true)

            if (session?.user) {
                void fetchProfile(session.user.id).finally(() => {
                    if (isMounted) setLoading(false)
                })
            } else {
                setProfile(null)
                setAuthError(null)
                setLoading(false)
            }
        })

        return () => {
            isMounted = false
            subscription.unsubscribe()
        }
    }, [fetchProfile])

    const signOut = async () => {
        await supabase.auth.signOut()
        setAuthError(null)
    }

    return (
        <AuthContext.Provider value={{ session, user, profile, loading, authError, signOut }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
