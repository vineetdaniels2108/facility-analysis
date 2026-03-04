"use client"

import { useState, useEffect, useCallback } from "react"
import { Settings, Save, Check, Building2 } from "lucide-react"

interface ModuleInfo { key: string; name: string }
interface FacilityModules {
    fac_id: number
    name: string
    enabledModules: string[]
}

export default function SettingsPage() {
    const [facilities, setFacilities] = useState<{ fac_id: number; name: string }[]>([])
    const [availableModules, setAvailableModules] = useState<ModuleInfo[]>([])
    const [facilityModules, setFacilityModules] = useState<Record<number, string[]>>({})
    const [saving, setSaving] = useState<number | null>(null)
    const [saved, setSaved] = useState<number | null>(null)
    const [loading, setLoading] = useState(true)

    const fetchData = useCallback(async () => {
        try {
            const [facRes, modRes] = await Promise.all([
                fetch('/api/facilities'),
                fetch('/api/admin/facility-modules'),
            ])
            const facData = await facRes.json()
            const modData = await modRes.json()

            setFacilities(facData.facilities ?? [])
            setAvailableModules(modData.availableModules ?? [])

            const moduleMap: Record<number, string[]> = {}
            for (const client of (modData.clients ?? [])) {
                for (const fid of (client.fac_ids ?? [])) {
                    moduleMap[fid] = client.enabled_modules ?? []
                }
            }

            for (const f of (facData.facilities ?? [])) {
                if (!moduleMap[f.fac_id]) {
                    moduleMap[f.fac_id] = modData.availableModules?.map((m: ModuleInfo) => m.key) ?? []
                }
            }
            setFacilityModules(moduleMap)
        } catch (err) {
            console.error('Failed to load settings:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchData() }, [fetchData])

    const toggleModule = (facId: number, moduleKey: string) => {
        setFacilityModules(prev => {
            const current = prev[facId] ?? []
            const next = current.includes(moduleKey)
                ? current.filter(m => m !== moduleKey)
                : [...current, moduleKey]
            return { ...prev, [facId]: next }
        })
    }

    const saveForFacility = async (facId: number) => {
        setSaving(facId)
        try {
            await fetch('/api/admin/facility-modules', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ facId, enabledModules: facilityModules[facId] ?? [] }),
            })
            setSaved(facId)
            setTimeout(() => setSaved(null), 2000)
        } catch {
            alert('Failed to save')
        } finally {
            setSaving(null)
        }
    }

    if (loading) {
        return <div className="flex items-center justify-center h-64 text-slate-400">Loading settings...</div>
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                    <Settings className="w-6 h-6 text-primary-500" />
                    Facility Module Settings
                </h1>
                <p className="text-slate-500 text-sm mt-1">Configure which analysis modules are enabled for each facility.</p>
            </div>

            <div className="space-y-4">
                {facilities.map(fac => {
                    const enabled = facilityModules[fac.fac_id] ?? []
                    const isSaving = saving === fac.fac_id
                    const isSaved = saved === fac.fac_id

                    return (
                        <div key={fac.fac_id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <Building2 className="w-5 h-5 text-slate-400" />
                                    <h3 className="font-semibold text-slate-800">{fac.name}</h3>
                                    <span className="text-xs text-slate-400">ID: {fac.fac_id}</span>
                                </div>
                                <button
                                    onClick={() => saveForFacility(fac.fac_id)}
                                    disabled={isSaving}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                        isSaved
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-primary-500 hover:bg-primary-600 text-white'
                                    }`}
                                >
                                    {isSaved ? <><Check className="w-3.5 h-3.5" /> Saved</> :
                                     isSaving ? 'Saving...' :
                                     <><Save className="w-3.5 h-3.5" /> Save</>}
                                </button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                {availableModules.map(mod => {
                                    const isOn = enabled.includes(mod.key)
                                    return (
                                        <label key={mod.key}
                                            className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                                                isOn ? 'border-primary-300 bg-primary-50' : 'border-slate-100 hover:border-slate-200'
                                            }`}>
                                            <input type="checkbox" checked={isOn} onChange={() => toggleModule(fac.fac_id, mod.key)}
                                                className="rounded border-slate-300 text-primary-500 focus:ring-primary-500" />
                                            <span className={`text-xs font-medium ${isOn ? 'text-primary-700' : 'text-slate-500'}`}>{mod.name}</span>
                                        </label>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
