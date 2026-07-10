import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Database } from '../../types/database.types'
import { Plus, Trash2, Archive, RotateCcw, Pencil, LayoutTemplate, Copy } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

type Template = Database['public']['Tables']['templates']['Row']

export default function Templates() {
    const { profile } = useAuth()
    const [templates, setTemplates] = useState<Template[]>([])
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [editName, setEditName] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [copyTargetTemplate, setCopyTargetTemplate] = useState<Template | null>(null)
    const [copySourceTemplateId, setCopySourceTemplateId] = useState('')
    const [replaceExistingZones, setReplaceExistingZones] = useState(false)
    const [copyingZones, setCopyingZones] = useState(false)

    useEffect(() => {
        fetchTemplates()
    }, [])

    const fetchTemplates = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('templates')
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error
            setTemplates(data || [])
        } catch (err) {
            console.error('Error fetching templates:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        try {
            setError(null)
            setSuccess(null)
            if (!file.type.startsWith('image/')) {
                throw new Error('Hanya file gambar yang diperbolehkan.')
            }
            if (file.size > 10 * 1024 * 1024) {
                throw new Error('Ukuran file maksimal 10MB.')
            }

            setUploading(true)
            const fileExt = file.name.split('.').pop()
            const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`
            const filePath = `${fileName}`

            const { error: uploadError } = await supabase.storage
                .from('templates')
                .upload(filePath, file)

            if (uploadError) throw uploadError

            const { data: { publicUrl } } = supabase.storage
                .from('templates')
                .getPublicUrl(filePath)

            const { data: insertData, error: insertError } = await supabase
                .from('templates')
                // @ts-ignore
                .insert([
                    {
                        name: file.name.split('.')[0],
                        background_image_url: publicUrl,
                        created_by: profile?.id
                    }
                ])
                .select()
                .single()

            if (insertError) throw insertError

            setTemplates([insertData, ...templates])
            setSuccess('Template berhasil diunggah.')
        } catch (err) {
            console.error('Error uploading template:', err)
            setError(err instanceof Error ? err.message : 'Upload gagal.')
        } finally {
            setUploading(false)
            event.target.value = ''
        }
    }

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this template?')) return

        try {
            const { error } = await supabase.from('templates').delete().eq('id', id)
            if (error) throw error
            setTemplates(templates.filter(t => t.id !== id))
            setSuccess('Template berhasil dihapus.')
        } catch (err) {
            console.error('Error deleting template:', err)
            setError('Gagal menghapus template.')
        }
    }

    const handleArchive = async (id: number, isArchived: boolean) => {
        try {
            const { error } = await supabase
                .from('templates')
                // @ts-ignore
                .update({ is_archived: isArchived })
                .eq('id', id)

            if (error) throw error
            setTemplates(templates.map(t => t.id === id ? { ...t, is_archived: isArchived } : t))
            setSuccess(isArchived ? 'Template dipindahkan ke arsip.' : 'Template dipulihkan dari arsip.')
        } catch (err) {
            console.error('Error archiving template:', err)
            setError('Gagal memperbarui status arsip template.')
        }
    }

    const startEdit = (template: Template) => {
        setEditingId(template.id)
        setEditName(template.name || '')
    }

    const saveEdit = async (id: number) => {
        try {
            const { error } = await supabase
                .from('templates')
                // @ts-ignore
                .update({ name: editName })
                .eq('id', id)

            if (error) throw error
            setTemplates(templates.map(t => t.id === id ? { ...t, name: editName } : t))
            setEditingId(null)
            setSuccess('Nama template berhasil diperbarui.')
        } catch (err) {
            console.error('Error renaming template:', err)
            setError('Gagal memperbarui nama template.')
        }
    }

    const startCopyZones = (targetTemplate: Template) => {
        setError(null)
        setSuccess(null)
        setCopyTargetTemplate(targetTemplate)
        setCopySourceTemplateId('')
        setReplaceExistingZones(false)
    }

    const handleCopyZones = async () => {
        if (!copyTargetTemplate || !copySourceTemplateId) return

        try {
            setCopyingZones(true)
            setError(null)
            setSuccess(null)
            const { data, error } = await supabase.rpc('copy_template_zones', {
                source_template_id: Number(copySourceTemplateId),
                target_template_id: copyTargetTemplate.id,
                replace_existing: replaceExistingZones,
            })

            if (error) throw error
            setSuccess(`${data?.count || 0} zona berhasil disalin ke ${copyTargetTemplate.name || 'template tujuan'}.`)
            setCopyTargetTemplate(null)
        } catch (err) {
            console.error('Error copying template zones:', err)
            setError(err instanceof Error ? err.message : 'Gagal menyalin zona template.')
        } finally {
            setCopyingZones(false)
        }
    }

    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return 'Unknown'
        try {
            const date = new Date(dateString)
            if (isNaN(date.getTime())) return 'Invalid Date'
            return date.toLocaleDateString()
        } catch (e) {
            return 'Error'
        }
    }

    const activeTemplates = templates.filter(t => !t.is_archived)
    const archivedTemplates = templates.filter(t => t.is_archived)

    const TemplateCard = ({ template }: { template: Template }) => (
        <div className="card group relative overflow-hidden transition-all hover:shadow-md">
            <div className="aspect-video w-full overflow-hidden bg-slate-100 relative">
                {template.background_image_url ? (
                    <img
                        src={template.background_image_url}
                        alt={template.name || 'Template'}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                ) : (
                    <div className="flex h-full items-center justify-center text-slate-400">
                        No Preview
                    </div>
                )}
                {/* Clickable area for edit, but doesn't block buttons below */}
                <Link
                    to={`/pr/editor/${template.id}`}
                    className="absolute inset-0 z-10"
                    title="Open Editor"
                />
            </div>

            <div className="p-4 relative z-20 bg-white">
                <div className="flex items-center justify-between">
                    {editingId === template.id ? (
                        <div className="flex flex-1 items-center gap-2">
                            <input
                                type="text"
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                className="input py-1 text-sm"
                                autoFocus
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(template.id) }}
                                onClick={(e) => e.preventDefault()}
                            />
                            <button onClick={() => saveEdit(template.id)} className="text-green-600 hover:text-green-800 text-xs font-bold">Save</button>
                            <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600 text-xs">Cancel</button>
                        </div>
                    ) : (
                        <h3 className="font-semibold text-slate-800 truncate flex-1" title={template.name || ''}>
                            {template.name || 'Untitled'}
                        </h3>
                    )}

                    <div className="flex items-center gap-1 ml-2">
                        {!editingId && (
                            <Link to={`/pr/editor/${template.id}`} className="p-1 text-slate-400 hover:text-blue-600" title="Buka Editor">
                                <LayoutTemplate className="h-4 w-4" />
                            </Link>
                        )}
                        {!editingId && (
                            <button onClick={() => startEdit(template)} className="p-1 text-slate-400 hover:text-blue-600" title="Ganti Nama">
                                <Pencil className="h-4 w-4" />
                            </button>
                        )}
                        {!editingId && (
                            <button onClick={() => startCopyZones(template)} className="p-1 text-slate-400 hover:text-blue-600" title="Salin zona dari template lain">
                                <Copy className="h-4 w-4" />
                            </button>
                        )}
                        <button
                            onClick={() => handleArchive(template.id, !template.is_archived)}
                            className="p-1 text-slate-400 hover:text-orange-600"
                            title={template.is_archived ? "Buka Arsip" : "Arsipkan"}
                        >
                            {template.is_archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                        </button>
                        <button onClick={() => handleDelete(template.id)} className="p-1 text-slate-400 hover:text-red-600" title="Hapus">
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                    Dibuat {formatDate(template.created_at)}
                </p>
            </div>
        </div>
    )

    return (
        <div className="container mx-auto max-w-6xl">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Template Jadwal</h1>
                    <p className="text-slate-500">Kelola template desain jadwal Anda</p>
                </div>
                <div className="relative">
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="template-upload"
                        disabled={uploading}
                    />
                    <label
                        htmlFor="template-upload"
                        className={`btn btn-primary cursor-pointer ${uploading ? 'opacity-75' : ''}`}
                    >
                        <Plus className="mr-2 h-5 w-5" />
                        {uploading ? 'Mengunggah...' : 'Template Baru'}
                    </label>
                </div>
            </div>

            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}
            {success && (
                <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                    {success}
                </div>
            )}

            {loading ? (
                <div className="text-center py-12 text-slate-500">Memuat template...</div>
            ) : (
                <div className="space-y-12">
                    {/* Active Templates */}
                    <section>
                        <h2 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2">
                            Template Aktif <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{activeTemplates.length}</span>
                        </h2>
                        {activeTemplates.length > 0 ? (
                            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                                {activeTemplates.map(template => (
                                    <TemplateCard key={template.id} template={template} />
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-lg border-2 border-dashed border-slate-200 p-12 text-center text-slate-500">
                                Belum ada template aktif. Unggah gambar untuk memulai.
                            </div>
                        )}
                    </section>

                    {/* Archived Templates */}
                    {archivedTemplates.length > 0 && (
                        <section className="opacity-75">
                            <h2 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2">
                                Arsip <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{archivedTemplates.length}</span>
                            </h2>
                            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                                {archivedTemplates.map(template => (
                                    <TemplateCard key={template.id} template={template} />
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}
            {copyTargetTemplate && (
                <div className="modal-backdrop">
                    <div className="modal-card max-w-lg">
                        <h2 className="text-lg font-bold text-slate-800">Salin Zona Template</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                            Pilih template sumber. Semua zona yang sudah ditempatkan di template sumber akan disalin ke <span className="font-semibold text-slate-700">{copyTargetTemplate.name || 'template tujuan'}</span>, supaya HUMAS tidak perlu mengatur ulang posisi zona.
                        </p>

                        <div className="mt-5 space-y-4">
                            <div>
                                <label className="mb-2 block text-sm font-bold text-slate-700">Template sumber</label>
                                <select
                                    value={copySourceTemplateId}
                                    onChange={e => setCopySourceTemplateId(e.target.value)}
                                    className="input"
                                >
                                    <option value="">Pilih template yang zonanya mau disalin</option>
                                    {templates
                                        .filter(template => template.id !== copyTargetTemplate.id)
                                        .map(template => (
                                            <option key={template.id} value={template.id}>{template.name || `Template #${template.id}`}</option>
                                        ))}
                                </select>
                            </div>

                            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                                <input
                                    type="checkbox"
                                    checked={replaceExistingZones}
                                    onChange={e => setReplaceExistingZones(e.target.checked)}
                                    className="mt-1"
                                />
                                <span>
                                    <span className="block font-bold text-slate-700">Ganti zona yang sudah ada di template tujuan</span>
                                    Jika tidak dicentang, zona hasil salinan akan ditambahkan tanpa menghapus zona yang sudah ada.
                                </span>
                            </label>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setCopyTargetTemplate(null)}
                                className="btn btn-secondary"
                                disabled={copyingZones}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleCopyZones}
                                className="btn btn-primary"
                                disabled={!copySourceTemplateId || copyingZones}
                            >
                                <Copy className="mr-2 h-4 w-4" />
                                {copyingZones ? 'Menyalin...' : 'Salin Zona'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

