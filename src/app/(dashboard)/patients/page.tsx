"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
    Users, ChevronRight, ChevronDown, Loader2, RefreshCw,
    Building2, AlertCircle, TrendingDown, Droplets, FlaskConical,
    Activity, Calendar, ClipboardList, FileText, X
} from "lucide-react"
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from "recharts"
import { ResourceDataRenderer } from "@/components/data/ResourceDataRenderer"

// ─── Types ────────────────────────────────────────────────────────────────────

interface LabValue {
    date: string
    value: number
    unit: string
    referenceRange: string
}

interface PatientSummary {
    simpl_id: string
    first_name: string
    last_name: string
    facility: string
    resources: string[]
    firstLabDate?: string
    lastLabDate?: string
    reportCount?: number
    labCount?: number
    labs_latest?: Record<string, LabValue>
}

interface InfusionIndicator {
    priority: "high" | "medium" | "low" | "none"
    score: number
    reasons: string[]
}

interface TransfusionIndicator {
    priority: "critical" | "high" | "medium" | "none"
    findings: Array<{ test: string; value: number; unit: string; reason: string }>
}

interface ResourceState {
    loading: boolean
    data: unknown
    error: string | null
}

// ─── Lab name alias resolver ─────────────────────────────────────────────────

const LAB_ALIASES: Record<string, string[]> = {
    Hemoglobin: ["Hemoglobin", "HGB", "HEMOGLOBIN", "Hgb"],
    Hematocrit: ["Hematocrit", "HCT", "HEMATOCRIT", "Hct"],
    Albumin: ["Albumin", "ALB", "ALBUMIN", "ALBUMIN, SERUM", "Alb"],
    Ferritin: ["Ferritin", "FERRITIN"],
    BUN: ["BUN", "Blood Urea Nitrogen"],
    Creatinine: ["Creatinine", "CREATININE", "Creat"],
    Sodium: ["Sodium", "SODIUM", "Na"],
    Potassium: ["Potassium", "POTASSIUM", "K"],
    CO2: ["CO2", "Carbon Dioxide", "Bicarbonate", "HCO3"],
    Chloride: ["Chloride", "CHLORIDE", "Cl"],
    "Anion Gap": ["Anion Gap", "ANION GAP"],
    Iron: ["Iron", "IRON", "Fe"],
}

function labLookup(labs: Record<string, LabValue>, canonical: string): LabValue | undefined {
    const aliases = LAB_ALIASES[canonical]
    if (!aliases) return labs[canonical]
    for (const alias of aliases) {
        if (labs[alias]) return labs[alias]
    }
    return undefined
}

// ─── Lab-based analysis (runs client-side from labs_latest) ───────────────────

function analyzeInfusion(labs: Record<string, LabValue>): InfusionIndicator {
    let score = 0
    const reasons: string[] = []

    const alb = labLookup(labs, "Albumin")?.value
    if (alb !== undefined) {
        if (alb < 2.8) { score += 40; reasons.push(`Critical Albumin (${alb} g/dL)`) }
        else if (alb < 3.0) { score += 35; reasons.push(`Very Low Albumin (${alb} g/dL)`) }
        else if (alb < 3.3) { score += 30; reasons.push(`Low Albumin (${alb} g/dL)`) }
        else if (alb < 3.5) { score += 20; reasons.push(`Suboptimal Albumin (${alb} g/dL)`) }
    }

    const bun = labLookup(labs, "BUN")?.value
    if (bun !== undefined && bun < 7) { score += 5; reasons.push(`Low BUN (${bun})`) }

    const ag = labLookup(labs, "Anion Gap")?.value
    if (ag !== undefined && (ag < 3 || ag > 12)) { score += 5; reasons.push(`Abnormal Anion Gap (${ag})`) }

    const creat = labLookup(labs, "Creatinine")?.value
    if (bun !== undefined && creat !== undefined && creat > 0) {
        const ratio = bun / creat
        if (ratio > 20) { score += 5; reasons.push(`High BUN/Creatinine Ratio (${ratio.toFixed(1)})`) }
    }

    const na = labLookup(labs, "Sodium")?.value
    const k = labLookup(labs, "Potassium")?.value
    const cl = labLookup(labs, "Chloride")?.value
    const co2 = labLookup(labs, "CO2")?.value
    let elecAbnormal = false
    if (na !== undefined && (na < 135 || na > 145)) elecAbnormal = true
    if (k !== undefined && (k < 3.5 || k > 5.0)) elecAbnormal = true
    if (cl !== undefined && (cl < 96 || cl > 106)) elecAbnormal = true
    if (co2 !== undefined && (co2 < 23 || co2 > 29)) elecAbnormal = true
    if (elecAbnormal) { score += 5; reasons.push("Electrolyte Imbalance") }

    if (creat !== undefined && creat < 0.6) { score += 5; reasons.push(`Low Creatinine (${creat})`) }

    const priority = score >= 50 ? "high" : score >= 30 ? "medium" : score > 0 ? "low" : "none"
    return { priority, score, reasons }
}

function analyzeTransfusion(labs: Record<string, LabValue>): TransfusionIndicator {
    const findings: TransfusionIndicator["findings"] = []

    const hgb = labLookup(labs, "Hemoglobin")?.value
    if (hgb !== undefined) {
        if (hgb < 7.0) findings.push({ test: "Hemoglobin", value: hgb, unit: "g/dL", reason: `Critically low (${hgb} g/dL < 7.0) — Immediate transfusion` })
        else if (hgb < 8.0) findings.push({ test: "Hemoglobin", value: hgb, unit: "g/dL", reason: `Significantly low (${hgb} g/dL) — Urgent transfusion consideration` })
    }

    const hct = labLookup(labs, "Hematocrit")?.value
    if (hct !== undefined && hct < 21.0) {
        findings.push({ test: "Hematocrit", value: hct, unit: "%", reason: `Critically low (${hct}%) — Evaluate for transfusion` })
    }

    const ferr = labLookup(labs, "Ferritin")?.value
    if (ferr !== undefined && ferr < 30.0) {
        findings.push({
            test: "Ferritin", value: ferr, unit: "ng/mL",
            reason: ferr < 15 ? `Absolute iron deficiency (${ferr} ng/mL) — Iron infusion` : `Iron deficiency (${ferr} ng/mL) — Iron infusion / oral iron`
        })
    }

    const priority = findings.some(f => f.test === "Hemoglobin" && f.value < 7) ? "critical"
        : findings.some(f => f.test === "Hemoglobin") ? "high"
        : findings.length > 0 ? "medium" : "none"
    return { priority, findings }
}

// ─── Priority badge ──────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<string, string> = {
    critical: "bg-red-600 text-white",
    high: "bg-red-100 text-red-700 border border-red-200",
    medium: "bg-amber-100 text-amber-700 border border-amber-200",
    low: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    none: "bg-slate-100 text-slate-500 border border-slate-200",
}

function PriorityBadge({ priority, label }: { priority: string; label: string }) {
    return (
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.none}`}>
            {label}
        </span>
    )
}

// ─── Lab value display ───────────────────────────────────────────────────────

const NORMAL_RANGES: Record<string, [number, number]> = {
    Hemoglobin: [11.0, 16.0], HGB: [11.0, 16.0], HEMOGLOBIN: [11.0, 16.0],
    Hematocrit: [34, 45], HCT: [34, 45], HEMATOCRIT: [34, 45],
    Albumin: [3.4, 5.0], ALB: [3.4, 5.0], ALBUMIN: [3.4, 5.0],
    BUN: [7, 23], Creatinine: [0.6, 1.2], CREATININE: [0.6, 1.2],
    Sodium: [136, 145], SODIUM: [136, 145],
    Potassium: [3.5, 5.0], POTASSIUM: [3.5, 5.0],
    Chloride: [96, 106], CHLORIDE: [96, 106],
    CO2: [23, 29], Ferritin: [30, 400],
}

function isAbnormal(name: string, value: number): boolean {
    const r = NORMAL_RANGES[name]
    if (!r) return false
    return value < r[0] || value > r[1]
}

function LabChip({ name, lab }: { name: string; lab: LabValue }) {
    const abnormal = isAbnormal(name, lab.value)
    return (
        <div className={`px-2 py-1 rounded-lg text-[11px] font-medium ${abnormal ? "bg-red-50 text-red-700 border border-red-200" : "bg-slate-50 text-slate-600 border border-slate-200"}`}>
            <span className="font-semibold">{name}:</span> {lab.value} {lab.unit}
        </div>
    )
}

// ─── Lab trend chart ─────────────────────────────────────────────────────────

function LabTrendChart({ name, history, refRange }: { name: string; history: Array<{ date: string; value: number }>; refRange?: string }) {
    const data = history.map(h => ({ date: h.date.slice(5), value: h.value, fullDate: h.date }))
    let refLow: number | undefined, refHigh: number | undefined
    if (refRange) {
        const m = refRange.match(/([\d.]+)\s*[-–]\s*([\d.]+)/)
        if (m) { refLow = parseFloat(m[1]); refHigh = parseFloat(m[2]) }
    }

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-600 mb-1">{name}</p>
            {refRange && <p className="text-[10px] text-slate-400 mb-2">Ref: {refRange}</p>}
            <ResponsiveContainer width="100%" height={120}>
                <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} width={35} domain={["auto", "auto"]} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <RechartsTooltip
                        contentStyle={{ fontSize: 11 }}
                        formatter={(val: any) => [String(val ?? ''), name]}
                        labelFormatter={(_label: any, payload: any) => {
                            return payload?.[0]?.payload?.fullDate ?? String(_label ?? '')
                        }}
                    />
                    {refLow !== undefined && <ReferenceLine y={refLow} stroke="#94a3b8" strokeDasharray="3 3" />}
                    {refHigh !== undefined && <ReferenceLine y={refHigh} stroke="#94a3b8" strokeDasharray="3 3" />}
                    <Line type="monotone" dataKey="value" stroke="#0d9488" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}

// ─── Main view ────────────────────────────────────────────────────────────────

const KEY_LABS_CANONICAL = ["Hemoglobin", "Hematocrit", "Albumin", "Ferritin", "BUN", "Creatinine", "Sodium", "Potassium", "CO2"]

function getKeyLabs(labs: Record<string, LabValue>): Array<{ canonical: string; name: string; lab: LabValue }> {
    return KEY_LABS_CANONICAL.map(canonical => {
        const lab = labLookup(labs, canonical)
        if (!lab) return null
        // Find actual key name
        const aliases = LAB_ALIASES[canonical] ?? [canonical]
        const actualKey = aliases.find(a => labs[a]) ?? canonical
        return { canonical, name: actualKey, lab }
    }).filter((x): x is { canonical: string; name: string; lab: LabValue } => x !== null)
}

function PatientsView() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const facilityName = searchParams.get('facility') ?? ''

    const [patients, setPatients] = useState<PatientSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [labHistory, setLabHistory] = useState<Record<string, unknown> | null>(null)
    const [labHistoryLoading, setLabHistoryLoading] = useState(false)
    const [openResources, setOpenResources] = useState<Record<string, ResourceState>>({})

    const loadPatients = useCallback(async () => {
        setLoading(true)
        try {
            const url = facilityName ? `/api/patients?facility=${encodeURIComponent(facilityName)}` : '/api/patients'
            const res = await fetch(url)
            const data = await res.json()
            setPatients(data.patients ?? [])
        } catch { setPatients([]) }
        finally { setLoading(false) }
    }, [facilityName])

    useEffect(() => {
        if (facilityName) loadPatients()
    }, [facilityName, loadPatients])

    const togglePatient = useCallback((simplId: string) => {
        if (expandedId === simplId) {
            setExpandedId(null)
            setLabHistory(null)
            setOpenResources({})
            return
        }
        setExpandedId(simplId)
        setOpenResources({})
        setLabHistoryLoading(true)
        fetch(`/api/patients/${simplId}/labs`)
            .then(r => r.json())
            .then(d => { setLabHistory(d.history ?? {}); setLabHistoryLoading(false) })
            .catch(() => { setLabHistory({}); setLabHistoryLoading(false) })
    }, [expandedId])

    const fetchResource = useCallback((simplId: string, resource: string) => {
        setOpenResources(prev => ({ ...prev, [resource]: { loading: true, data: null, error: null } }))
        fetch(`/api/v1/pcc/${simplId}/data/${resource}`)
            .then(r => r.json())
            .then(data => setOpenResources(prev => ({ ...prev, [resource]: { loading: false, data, error: null } })))
            .catch(err => setOpenResources(prev => ({ ...prev, [resource]: { loading: false, data: null, error: err instanceof Error ? err.message : 'Error' } })))
    }, [])

    const closeResource = useCallback((resource: string) => {
        setOpenResources(prev => {
            const next = { ...prev }
            delete next[resource]
            return next
        })
    }, [])

    // Sort: critical/high first
    const sortedPatients = [...patients].sort((a, b) => {
        const ta = analyzeTransfusion(a.labs_latest ?? {})
        const tb = analyzeTransfusion(b.labs_latest ?? {})
        const ia = analyzeInfusion(a.labs_latest ?? {})
        const ib = analyzeInfusion(b.labs_latest ?? {})
        const order = { critical: 0, high: 1, medium: 2, low: 3, none: 4 }
        const sa = Math.min(order[ta.priority] ?? 4, order[ia.priority] ?? 4)
        const sb = Math.min(order[tb.priority] ?? 4, order[ib.priority] ?? 4)
        return sa - sb
    })

    // ── Empty state ──
    if (!facilityName) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center"><Building2 className="w-8 h-8 text-slate-400" /></div>
                <h2 className="text-xl font-semibold text-slate-700">Select a Facility</h2>
                <p className="text-slate-500 max-w-sm">Use the facility dropdown in the top-right corner or go to the <button onClick={() => router.push('/dashboard')} className="text-teal-600 underline">dashboard</button>.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-600 flex items-center justify-center shadow-sm border border-teal-200/50">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{facilityName}</h1>
                        <p className="text-slate-500 text-sm">{loading ? 'Loading...' : `${patients.length} patients`}</p>
                    </div>
                </div>
                <button onClick={loadPatients} disabled={loading} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-slate-200 hover:border-teal-400 hover:text-teal-600 text-slate-600 rounded-xl transition-colors shadow-sm disabled:opacity-50">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Legend */}
            {!loading && patients.length > 0 && (
                <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                    <span className="font-medium">Priority:</span>
                    <PriorityBadge priority="critical" label="Critical" />
                    <PriorityBadge priority="high" label="High" />
                    <PriorityBadge priority="medium" label="Medium" />
                    <PriorityBadge priority="low" label="Low" />
                    <span className="text-slate-400">· Sorted highest priority first · Based on latest lab values</span>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading patients...</div>
            )}

            {/* Empty */}
            {!loading && patients.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-2">
                    <AlertCircle className="w-6 h-6" /><p>No patients found for this facility.</p>
                </div>
            )}

            {/* Patient List */}
            <div className="space-y-2">
                {sortedPatients.map(patient => {
                    const labs = patient.labs_latest ?? {}
                    const hasLabs = Object.keys(labs).length > 0
                    const inf = analyzeInfusion(labs)
                    const tran = analyzeTransfusion(labs)
                    const isExpanded = expandedId === patient.simpl_id
                    const keyLabs = getKeyLabs(labs)

                    return (
                        <div key={patient.simpl_id} className="bg-white border border-slate-100 rounded-2xl shadow-sm">
                            {/* Patient row */}
                            <button
                                onClick={() => togglePatient(patient.simpl_id)}
                                className="w-full flex items-start justify-between px-5 py-4 hover:bg-slate-50/50 transition-colors gap-4 text-left"
                            >
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${isExpanded ? 'bg-teal-500 text-white' : 'bg-teal-50 text-teal-600'}`}>
                                        {patient.first_name[0]}{patient.last_name[0]}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-slate-800 text-sm">{patient.last_name}, {patient.first_name}</p>
                                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                            {patient.lastLabDate && (
                                                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                                    <Calendar className="w-3 h-3" />
                                                    Last lab: {patient.lastLabDate}
                                                </span>
                                            )}
                                            {patient.reportCount != null && patient.reportCount > 0 && (
                                                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                                    <FileText className="w-3 h-3" />
                                                    {patient.reportCount} reports
                                                </span>
                                            )}
                                            {patient.firstLabDate && patient.lastLabDate && (
                                                <span className="text-[10px] text-slate-400">
                                                    Since {patient.firstLabDate}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                                    {/* Infusion indicator */}
                                    {hasLabs && inf.priority !== "none" && (
                                        <div className="flex items-center gap-1">
                                            <Droplets className="w-3 h-3 text-blue-500" />
                                            <PriorityBadge priority={inf.priority} label={`Infusion ${inf.score}pts`} />
                                        </div>
                                    )}

                                    {/* Transfusion indicator */}
                                    {hasLabs && tran.priority !== "none" && (
                                        <div className="flex items-center gap-1">
                                            <FlaskConical className="w-3 h-3 text-red-500" />
                                            <PriorityBadge priority={tran.priority} label={`Transfusion`} />
                                        </div>
                                    )}

                                    {!hasLabs && (
                                        <span className="text-[10px] text-slate-400 italic">No lab data</span>
                                    )}

                                    {/* Key lab chips */}
                                    <div className="hidden lg:flex items-center gap-1 ml-2">
                                        {keyLabs.slice(0, 4).map(kl => (
                                            <LabChip key={kl.canonical} name={kl.canonical} lab={kl.lab} />
                                        ))}
                                    </div>

                                    {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                </div>
                            </button>

                            {/* Expanded detail */}
                            {isExpanded && (
                                <div className="border-t border-slate-100 bg-slate-50/50">

                                    {/* Infusion / Transfusion analysis */}
                                    {hasLabs && (inf.reasons.length > 0 || tran.findings.length > 0) && (
                                        <div className="px-5 py-4 border-b border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Infusion */}
                                            {inf.reasons.length > 0 && (
                                                <div className="bg-white border border-blue-200 rounded-xl p-4">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Droplets className="w-4 h-4 text-blue-500" />
                                                        <span className="text-sm font-semibold text-slate-700">Infusion Analysis</span>
                                                        <PriorityBadge priority={inf.priority} label={`${inf.score} pts · ${inf.priority}`} />
                                                    </div>
                                                    <ul className="space-y-1">
                                                        {inf.reasons.map((r, i) => (
                                                            <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                                                                <TrendingDown className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
                                                                {r}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Transfusion */}
                                            {tran.findings.length > 0 && (
                                                <div className="bg-white border border-red-200 rounded-xl p-4">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <FlaskConical className="w-4 h-4 text-red-500" />
                                                        <span className="text-sm font-semibold text-slate-700">Transfusion / Critical Labs</span>
                                                        <PriorityBadge priority={tran.priority} label={tran.priority} />
                                                    </div>
                                                    <ul className="space-y-1.5">
                                                        {tran.findings.map((f, i) => (
                                                            <li key={i} className="text-xs text-slate-600">
                                                                <span className="font-semibold text-red-600">{f.test}: {f.value} {f.unit}</span>
                                                                <span className="text-slate-500 ml-1">— {f.reason}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Key labs summary */}
                                    {hasLabs && (
                                        <div className="px-5 py-4 border-b border-slate-100">
                                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                                                <Activity className="w-3.5 h-3.5" />
                                                Latest Lab Values ({Object.keys(labs).length} tests)
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {keyLabs.map(kl => (
                                                    <LabChip key={kl.canonical} name={kl.canonical} lab={kl.lab} />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Trend charts */}
                                    {labHistoryLoading && (
                                        <div className="px-5 py-6 text-center text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading lab trends...</div>
                                    )}

                                    {!labHistoryLoading && labHistory && Object.keys(labHistory).length > 0 && (() => {
                                        const histMap = labHistory as Record<string, Array<{ date: string; value: number; referenceRange?: string }>>
                                        const chartsToShow = KEY_LABS_CANONICAL.map(canonical => {
                                            const aliases = LAB_ALIASES[canonical] ?? [canonical]
                                            const actualKey = aliases.find(a => histMap[a] && histMap[a].length >= 2)
                                            if (!actualKey) return null
                                            const latestLab = labLookup(labs, canonical)
                                            return { canonical, history: histMap[actualKey], refRange: histMap[actualKey][0]?.referenceRange ?? latestLab?.referenceRange }
                                        }).filter(Boolean) as Array<{ canonical: string; history: Array<{ date: string; value: number }>; refRange?: string }>

                                        if (chartsToShow.length === 0) return null
                                        return (
                                            <div className="px-5 py-4 border-b border-slate-100">
                                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Lab Trends</p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {chartsToShow.map(c => (
                                                        <LabTrendChart key={c.canonical} name={c.canonical} history={c.history} refRange={c.refRange} />
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    })()}

                                    {/* Data resources browser */}
                                    <div className="px-5 py-4">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
                                            <ClipboardList className="w-3.5 h-3.5" />
                                            Data Resources
                                        </p>
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {patient.resources.map(resource => {
                                                const rs = openResources[resource]
                                                const isActive = !!rs
                                                return (
                                                    <button
                                                        key={resource}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            isActive ? closeResource(resource) : fetchResource(patient.simpl_id, resource)
                                                        }}
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                                            isActive ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400'
                                                        }`}
                                                    >
                                                        {rs?.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : isActive ? <X className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                                                        {resource}
                                                    </button>
                                                )
                                            })}
                                        </div>

                                        {Object.entries(openResources).map(([resource, rs]) => (
                                            <div key={resource} className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-3">
                                                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
                                                    <span className="text-xs font-semibold text-slate-700">{resource}</span>
                                                    <button onClick={() => closeResource(resource)} className="p-1 text-slate-400 hover:text-red-600 rounded-md transition-colors"><X className="w-3 h-3" /></button>
                                                </div>
                                                <div className="p-4 max-h-80 overflow-y-auto">
                                                    {rs.loading && <div className="text-sm text-slate-400 py-4 text-center"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading...</div>}
                                                    {rs.error && <div className="text-xs text-red-600 bg-red-50 rounded-lg p-3"><AlertCircle className="w-4 h-4 inline mr-1" />{rs.error}</div>}
                                                    {rs.data != null && !rs.loading && <ResourceDataRenderer resource={resource} data={rs.data} />}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export default function PatientsPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center py-32 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...</div>}>
            <PatientsView />
        </Suspense>
    )
}
