"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
    Building2, Loader2, Users, AlertTriangle, ChevronRight,
    Droplets, FlaskConical, Syringe, Utensils, Apple, TrendingDown
} from "lucide-react"

interface FacilitySummary {
    fac_id: number
    name: string
    active_count: number
    critical: number
    high: number
    infusion_count: number
    transfusion_count: number
    foley_count: number
    gtube_count: number
    mtn_count: number
}

interface UrgentPatient {
    simpl_id: string
    first_name: string
    last_name: string
    room: string
    fac_name: string
    fac_id: number
    max_sev: string
    flags: string
    hgb: number | null
    alb: number | null
    last_lab_date: string | null
}

function FlagBadge({ type, sev }: { type: string; sev?: string }) {
    const isCrit = sev === 'critical'
    const map: Record<string, { label: string; cls: string; critCls: string; icon: React.ReactNode }> = {
        infusion:    { label: "Infusion",    cls: "bg-blue-100 text-blue-700",   critCls: "bg-blue-600 text-white",   icon: <Droplets className="w-2.5 h-2.5" /> },
        transfusion: { label: "Transfusion", cls: "bg-rose-100 text-rose-700",   critCls: "bg-rose-600 text-white",   icon: <FlaskConical className="w-2.5 h-2.5" /> },
        foley_risk:  { label: "Foley",       cls: "bg-purple-100 text-purple-700",critCls:"bg-purple-600 text-white",  icon: <Syringe className="w-2.5 h-2.5" /> },
        gtube_risk:  { label: "G-Tube",      cls: "bg-orange-100 text-orange-700",critCls:"bg-orange-600 text-white",  icon: <Utensils className="w-2.5 h-2.5" /> },
        mtn_risk:    { label: "MTN",         cls: "bg-lime-100 text-lime-700",   critCls: "bg-lime-700 text-white",   icon: <Apple className="w-2.5 h-2.5" /> },
    }
    const m = map[type]
    if (!m) return null
    return (
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded ${isCrit ? m.critCls : m.cls}`}>
            {m.icon}{m.label}
        </span>
    )
}

export default function DashboardPage() {
    const router = useRouter()
    const [facilities, setFacilities] = useState<FacilitySummary[]>([])
    const [urgent, setUrgent] = useState<UrgentPatient[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch('/api/dashboard/summary')
            .then(r => r.json())
            .then(d => {
                setFacilities(d.facilities ?? [])
                setUrgent(d.urgent ?? [])
                setLoading(false)
            })
            .catch(() => setLoading(false))
    }, [])

    const totalCritical = facilities.reduce((s, f) => s + f.critical, 0)
    const totalHigh = facilities.reduce((s, f) => s + f.high, 0)

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...
            </div>
        )
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Top summary bar */}
            {(totalCritical > 0 || totalHigh > 0) && (
                <div className="mb-6 flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                    <div>
                        <p className="text-sm font-bold text-red-800">Patients requiring immediate attention</p>
                        <p className="text-xs text-red-600 mt-0.5">
                            {totalCritical > 0 && <span className="font-bold">{totalCritical} critical</span>}
                            {totalCritical > 0 && totalHigh > 0 && " and "}
                            {totalHigh > 0 && <span>{totalHigh} high</span>}
                            {" "}across all facilities
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
                {/* LEFT: Facility list */}
                <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-4">Facilities</h2>
                    <div className="space-y-3">
                        {facilities.map(f => (
                            <button key={f.fac_id}
                                onClick={() => router.push(`/patients?facility=${encodeURIComponent(f.name)}`)}
                                className="w-full flex items-start justify-between bg-white border border-slate-200 hover:border-teal-400 hover:shadow-md rounded-2xl px-5 py-4 transition-all group text-left">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center group-hover:bg-teal-100 transition-colors shrink-0 mt-0.5">
                                        <Building2 className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-slate-800 group-hover:text-teal-700 transition-colors">{f.name}</p>
                                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                                            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{f.active_count} active</span>
                                            {f.critical > 0 && <span className="flex items-center gap-1 text-red-600 font-bold"><AlertTriangle className="w-3 h-3" />{f.critical} critical</span>}
                                            {f.high > 0 && <span className="flex items-center gap-1 text-red-500"><TrendingDown className="w-3 h-3" />{f.high} high</span>}
                                        </div>
                                        {/* Flag counts */}
                                        <div className="flex gap-1.5 mt-2 flex-wrap">
                                            {f.transfusion_count > 0 && <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-100 text-rose-700"><FlaskConical className="w-2.5 h-2.5" />{f.transfusion_count} Transfusion</span>}
                                            {f.infusion_count > 0 && <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded bg-blue-100 text-blue-700"><Droplets className="w-2.5 h-2.5" />{f.infusion_count} Infusion</span>}
                                            {f.foley_count > 0 && <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded bg-purple-100 text-purple-700"><Syringe className="w-2.5 h-2.5" />{f.foley_count} Foley</span>}
                                            {f.gtube_count > 0 && <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded bg-orange-100 text-orange-700"><Utensils className="w-2.5 h-2.5" />{f.gtube_count} G-Tube</span>}
                                            {f.mtn_count > 0 && <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded bg-lime-100 text-lime-700"><Apple className="w-2.5 h-2.5" />{f.mtn_count} MTN</span>}
                                        </div>
                                    </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500 mt-1 shrink-0 transition-colors" />
                            </button>
                        ))}
                    </div>
                </div>

                {/* RIGHT: Urgent patients across all facilities */}
                <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-4">
                        Attend Immediately
                        {urgent.length > 0 && <span className="ml-2 text-sm font-normal text-slate-400">({urgent.length} patients)</span>}
                    </h2>
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                        {urgent.length === 0 ? (
                            <div className="py-12 text-center text-sm text-slate-400">No urgent patients right now</div>
                        ) : (
                            <div className="divide-y divide-slate-50 max-h-[calc(100vh-240px)] overflow-y-auto">
                                {urgent.map(p => {
                                    const flagTypes = p.flags ? p.flags.split(',') : []
                                    const isCrit = p.max_sev === 'critical'
                                    return (
                                        <button key={p.simpl_id}
                                            onClick={() => router.push(`/patients?facility=${encodeURIComponent(p.fac_name)}`)}
                                            className="w-full px-4 py-3 hover:bg-slate-50/60 transition-colors text-left group">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-start gap-2.5 min-w-0">
                                                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${isCrit ? "bg-red-500 animate-pulse" : "bg-red-300"}`} />
                                                    <div className="min-w-0">
                                                        <p className={`text-sm font-bold truncate ${isCrit ? "text-slate-900" : "text-slate-700"}`}>
                                                            {p.last_name}, {p.first_name}
                                                        </p>
                                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                                            {p.fac_name.replace("Rehabilitation and Healthcare", "Rehab").replace(" Center", "")}
                                                            {p.room && ` · Rm ${p.room}`}
                                                        </p>
                                                        <div className="flex gap-1 mt-1.5 flex-wrap">
                                                            {flagTypes.map(t => <FlagBadge key={t} type={t} sev={p.max_sev} />)}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    {p.hgb != null && <p className="text-[10px] font-bold text-rose-600">Hgb {p.hgb}</p>}
                                                    {p.alb != null && <p className="text-[10px] font-bold text-blue-600">Alb {p.alb}</p>}
                                                    {p.last_lab_date && <p className="text-[9px] text-slate-400 mt-0.5">{new Date(p.last_lab_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>}
                                                </div>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
