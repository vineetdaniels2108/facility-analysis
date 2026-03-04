"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
    Building2, Loader2, Users, AlertTriangle, ChevronRight,
    Droplets, FlaskConical, Syringe, Utensils, Apple,
    ChevronLeft, Heart, ClipboardList, Stethoscope, Brain,
} from "lucide-react"

interface FacilitySummary {
    fac_id: number
    name: string
    active_count: number
    critical: number
    high: number
    enabled_modules: string[]
    module_counts: Record<string, number>
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
    enabled_modules: string[]
}

const FLAG_META: Record<string, { label: string; cls: string; critCls: string; icon: React.ReactNode }> = {
    infusion:     { label: "Infusion",      cls: "bg-blue-100 text-blue-700",     critCls: "bg-blue-600 text-white",     icon: <Droplets className="w-2.5 h-2.5" /> },
    transfusion:  { label: "Transfusion",   cls: "bg-rose-100 text-rose-700",     critCls: "bg-rose-600 text-white",     icon: <FlaskConical className="w-2.5 h-2.5" /> },
    foley_risk:   { label: "Foley",         cls: "bg-purple-100 text-purple-700", critCls: "bg-purple-600 text-white",   icon: <Syringe className="w-2.5 h-2.5" /> },
    gtube_risk:   { label: "G-Tube",        cls: "bg-orange-100 text-orange-700", critCls: "bg-orange-600 text-white",   icon: <Utensils className="w-2.5 h-2.5" /> },
    mtn_risk:     { label: "MTN",           cls: "bg-lime-100 text-lime-700",     critCls: "bg-lime-700 text-white",     icon: <Apple className="w-2.5 h-2.5" /> },
    cardiology:   { label: "Cardiology",    cls: "bg-red-100 text-red-700",       critCls: "bg-red-600 text-white",      icon: <Heart className="w-2.5 h-2.5" /> },
    care_gaps:    { label: "Care Gaps",     cls: "bg-amber-100 text-amber-700",   critCls: "bg-amber-600 text-white",    icon: <ClipboardList className="w-2.5 h-2.5" /> },
    primary_care: { label: "Primary Care",  cls: "bg-teal-100 text-teal-700",     critCls: "bg-teal-600 text-white",     icon: <Stethoscope className="w-2.5 h-2.5" /> },
    psych_meds:   { label: "Psych/Meds",    cls: "bg-indigo-100 text-indigo-700", critCls: "bg-indigo-600 text-white",   icon: <Brain className="w-2.5 h-2.5" /> },
}

function FlagBadge({ type, isCrit }: { type: string; isCrit: boolean }) {
    const m = FLAG_META[type]
    if (!m) return null
    return (
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded ${isCrit ? m.critCls : m.cls}`}>
            {m.icon}{m.label}
        </span>
    )
}

const PAGE_SIZE = 15

export default function DashboardPage() {
    const router = useRouter()
    const [facilities, setFacilities] = useState<FacilitySummary[]>([])
    const [urgent, setUrgent] = useState<UrgentPatient[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(0)
    const [sevFilter, setSevFilter] = useState<"all" | "critical" | "high">("all")

    useEffect(() => {
        fetch('/api/dashboard/summary')
            .then(r => r.json())
            .then(d => { setFacilities(d.facilities ?? []); setUrgent(d.urgent ?? []); setLoading(false) })
            .catch(() => setLoading(false))
    }, [])

    const filteredUrgent = sevFilter === "all" ? urgent
        : urgent.filter(p => p.max_sev === sevFilter)

    const totalPages = Math.ceil(filteredUrgent.length / PAGE_SIZE)
    const pagePatients = filteredUrgent.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

    const totalCritical = urgent.filter(p => p.max_sev === 'critical').length
    const totalHigh = urgent.filter(p => p.max_sev === 'high').length

    const fmtFac = (name: string) => name
        .replace("Rehabilitation and Healthcare Center", "Rehab")
        .replace("Rehabilitation and Healthcare", "Rehab")
        .replace("Rehab and Healthcare", "Rehab")

    if (loading) return (
        <div className="flex items-center justify-center py-32 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...
        </div>
    )

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Alert bar */}
            {(totalCritical > 0 || totalHigh > 0) && (
                <div className="mb-5 flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <p className="text-sm text-red-800">
                        {totalCritical > 0 && <span className="font-bold">{totalCritical} critical</span>}
                        {totalCritical > 0 && totalHigh > 0 && <span className="text-red-500"> · </span>}
                        {totalHigh > 0 && <span className="font-semibold">{totalHigh} high</span>}
                        <span className="text-red-500"> patients across all facilities need attention</span>
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* LEFT: Facilities */}
                <div>
                    <h2 className="text-base font-bold text-slate-800 mb-3">Facilities</h2>
                    <div className="space-y-3">
                        {facilities.map(f => (
                            <button key={f.fac_id}
                                onClick={() => router.push(`/patients?facility=${encodeURIComponent(f.name)}`)}
                                className="w-full flex items-start justify-between bg-white border border-slate-200 hover:border-teal-400 hover:shadow-md rounded-2xl px-5 py-4 transition-all group text-left">
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center group-hover:bg-teal-100 transition-colors shrink-0 mt-0.5">
                                        <Building2 className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-sm text-slate-800 group-hover:text-teal-700 transition-colors truncate">{f.name}</p>
                                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                                            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{f.active_count} active</span>
                                            {f.critical > 0 && <span className="flex items-center gap-1 text-red-600 font-bold"><AlertTriangle className="w-3 h-3" />{f.critical} critical</span>}
                                            {f.high > 0 && <span className="text-amber-600 font-semibold">{f.high} high</span>}
                                        </div>
                                        <div className="flex gap-1 mt-2 flex-wrap">
                                            {f.enabled_modules.map(mod => {
                                                const count = f.module_counts[mod] ?? 0;
                                                const meta = FLAG_META[mod];
                                                if (!meta || count === 0) return null;
                                                return (
                                                    <span key={mod} className={`flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded ${meta.cls}`}>
                                                        {meta.icon}{count}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500 mt-1 shrink-0 transition-colors" />
                            </button>
                        ))}
                    </div>
                </div>

                {/* RIGHT: Urgent patients */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-base font-bold text-slate-800">
                            Attend Immediately
                            <span className="ml-2 text-sm font-normal text-slate-400">({filteredUrgent.length})</span>
                        </h2>
                        {/* Severity filter */}
                        <div className="flex gap-1">
                            {([["all", "All"], ["critical", `Critical ${totalCritical}`], ["high", `High ${totalHigh}`]] as const).map(([val, lbl]) => (
                                <button key={val} onClick={() => { setSevFilter(val); setPage(0) }}
                                    className={`px-2 py-1 text-[10px] font-bold rounded-md border transition-all ${
                                        sevFilter === val
                                            ? val === 'critical' ? 'bg-red-600 text-white border-red-600'
                                                : val === 'high' ? 'bg-amber-500 text-white border-amber-500'
                                                : 'bg-slate-700 text-white border-slate-700'
                                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                    }`}>
                                    {lbl}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                        {filteredUrgent.length === 0 ? (
                            <div className="py-12 text-center text-sm text-slate-400">No urgent patients</div>
                        ) : (
                            <>
                                <div className="divide-y divide-slate-50">
                                    {pagePatients.map(p => {
                                        const flagTypes = p.flags ? p.flags.split(',').filter(f => f && p.enabled_modules?.includes(f)) : []
                                        const isCrit = p.max_sev === 'critical'
                                        const showHgbAlb = p.enabled_modules?.some(m => m === 'infusion' || m === 'transfusion')
                                        return (
                                            <button key={p.simpl_id}
                                                onClick={() => router.push(`/patients?facility=${encodeURIComponent(p.fac_name)}`)}
                                                className="w-full px-4 py-3 hover:bg-slate-50/60 transition-colors text-left group">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex items-start gap-2.5 min-w-0">
                                                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${isCrit ? "bg-red-500 animate-pulse" : "bg-amber-400"}`} />
                                                        <div className="min-w-0">
                                                            <p className={`text-sm font-bold truncate ${isCrit ? "text-slate-900" : "text-slate-700"}`}>
                                                                {p.last_name}, {p.first_name}
                                                            </p>
                                                            <p className="text-[10px] text-slate-400 mt-0.5">
                                                                {fmtFac(p.fac_name)}{p.room && ` · Rm ${p.room}`}
                                                            </p>
                                                            <div className="flex gap-1 mt-1.5 flex-wrap">
                                                                {flagTypes.map(t => <FlagBadge key={t} type={t} isCrit={isCrit} />)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        {showHgbAlb && p.hgb != null && <p className="text-[10px] font-bold text-rose-600">Hgb {p.hgb}</p>}
                                                        {showHgbAlb && p.alb != null && <p className="text-[10px] font-bold text-blue-600">Alb {p.alb}</p>}
                                                        {p.last_lab_date && <p className="text-[9px] text-slate-400 mt-0.5">{new Date(p.last_lab_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>}
                                                    </div>
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
                                        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                                            className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                                            <ChevronLeft className="w-3.5 h-3.5" /> Prev
                                        </button>
                                        <span className="text-[10px] text-slate-400">
                                            {page + 1} / {totalPages} · {filteredUrgent.length} patients
                                        </span>
                                        <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                                            className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                                            Next <ChevronRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
