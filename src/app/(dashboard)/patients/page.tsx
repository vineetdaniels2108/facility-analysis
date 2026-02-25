"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
    Users, ChevronRight, ChevronDown, Loader2, RefreshCw,
    Building2, AlertTriangle, Droplets, FlaskConical,
    Activity, Calendar, ClipboardList, FileText, X, AlertCircle
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

interface InfusionResult {
    priority: "high" | "medium" | "low" | "none"
    score: number
    reasons: string[]
    albumin?: number
    albumin_date?: string
}

interface TransfusionResult {
    priority: "critical" | "high" | "medium" | "none"
    hemoglobin?: number
    hemoglobin_date?: string
    hematocrit?: number
    ferritin?: number
    findings: Array<{ test: string; value: number; unit: string; reason: string }>
}

interface ResourceState {
    loading: boolean
    data: unknown
    error: string | null
}

// ─── Lab alias resolver ──────────────────────────────────────────────────────

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

// ─── Analysis ────────────────────────────────────────────────────────────────

function analyzeInfusion(labs: Record<string, LabValue>): InfusionResult {
    let score = 0
    const reasons: string[] = []
    const albLab = labLookup(labs, "Albumin")
    const alb = albLab?.value

    if (alb !== undefined) {
        if (alb < 2.5) { score += 50; reasons.push(`Critically low Albumin: ${alb} g/dL — IV albumin infusion strongly recommended`) }
        else if (alb < 2.8) { score += 40; reasons.push(`Severely low Albumin: ${alb} g/dL — Albumin infusion recommended`) }
        else if (alb < 3.0) { score += 35; reasons.push(`Very low Albumin: ${alb} g/dL — Consider albumin infusion`) }
        else if (alb < 3.3) { score += 30; reasons.push(`Low Albumin: ${alb} g/dL — Monitor closely, possible infusion candidate`) }
        else if (alb < 3.5) { score += 15; reasons.push(`Suboptimal Albumin: ${alb} g/dL — Nutritional intervention recommended`) }
    }

    const na = labLookup(labs, "Sodium")?.value
    const k = labLookup(labs, "Potassium")?.value
    const cl = labLookup(labs, "Chloride")?.value
    const co2 = labLookup(labs, "CO2")?.value
    const elecIssues: string[] = []
    if (na !== undefined && na < 135) elecIssues.push(`Na ${na}`)
    if (na !== undefined && na > 145) elecIssues.push(`Na ${na}`)
    if (k !== undefined && (k < 3.5 || k > 5.0)) elecIssues.push(`K ${k}`)
    if (cl !== undefined && (cl < 96 || cl > 106)) elecIssues.push(`Cl ${cl}`)
    if (co2 !== undefined && (co2 < 23 || co2 > 29)) elecIssues.push(`CO2 ${co2}`)
    if (elecIssues.length > 0) { score += 5 * elecIssues.length; reasons.push(`Electrolyte imbalance: ${elecIssues.join(", ")}`) }

    const bun = labLookup(labs, "BUN")?.value
    const creat = labLookup(labs, "Creatinine")?.value
    if (bun !== undefined && creat !== undefined && creat > 0 && bun / creat > 20) {
        score += 5; reasons.push(`Elevated BUN/Creatinine ratio (${(bun / creat).toFixed(0)}) — possible dehydration`)
    }

    const priority = score >= 40 ? "high" : score >= 25 ? "medium" : score > 0 ? "low" : "none"
    return { priority, score, reasons, albumin: alb, albumin_date: albLab?.date }
}

function analyzeTransfusion(labs: Record<string, LabValue>): TransfusionResult {
    const findings: TransfusionResult["findings"] = []
    const hgbLab = labLookup(labs, "Hemoglobin")
    const hgb = hgbLab?.value
    const hct = labLookup(labs, "Hematocrit")?.value
    const ferr = labLookup(labs, "Ferritin")?.value

    if (hgb !== undefined) {
        if (hgb < 7.0) findings.push({ test: "Hemoglobin", value: hgb, unit: "g/dL", reason: `CRITICAL — Hgb ${hgb} g/dL is below 7.0. Transfusion needed immediately.` })
        else if (hgb < 8.0) findings.push({ test: "Hemoglobin", value: hgb, unit: "g/dL", reason: `URGENT — Hgb ${hgb} g/dL. Evaluate for transfusion, especially if symptomatic.` })
        else if (hgb < 9.0) findings.push({ test: "Hemoglobin", value: hgb, unit: "g/dL", reason: `LOW — Hgb ${hgb} g/dL. Monitor closely, transfusion if declining or symptomatic.` })
    }

    if (hct !== undefined && hct < 25.0) {
        findings.push({ test: "Hematocrit", value: hct, unit: "%", reason: `Low Hct ${hct}% — supports transfusion evaluation` })
    }

    if (ferr !== undefined && ferr < 30.0) {
        findings.push({
            test: "Ferritin", value: ferr, unit: "ng/mL",
            reason: ferr < 15 ? `Severe iron deficiency (${ferr} ng/mL) — IV iron infusion indicated` : `Iron deficiency (${ferr} ng/mL) — Iron replacement needed`
        })
    }

    const priority = findings.some(f => f.test === "Hemoglobin" && f.value < 7) ? "critical"
        : findings.some(f => f.test === "Hemoglobin" && f.value < 8) ? "high"
        : findings.length > 0 ? "medium" : "none"
    return { priority, hemoglobin: hgb, hemoglobin_date: hgbLab?.date, hematocrit: hct, ferritin: ferr, findings }
}

// ─── Trend chart ─────────────────────────────────────────────────────────────

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
            {refRange && <p className="text-[10px] text-slate-400 mb-2">Normal: {refRange}</p>}
            <ResponsiveContainer width="100%" height={120}>
                <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} width={35} domain={["auto", "auto"]} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <RechartsTooltip contentStyle={{ fontSize: 11 }} formatter={(val: any) => [String(val ?? ''), name]} labelFormatter={(_l: any, p: any) => p?.[0]?.payload?.fullDate ?? String(_l ?? '')} />
                    {refLow !== undefined && <ReferenceLine y={refLow} stroke="#94a3b8" strokeDasharray="3 3" />}
                    {refHigh !== undefined && <ReferenceLine y={refHigh} stroke="#94a3b8" strokeDasharray="3 3" />}
                    <Line type="monotone" dataKey="value" stroke="#0d9488" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}

// ─── Alert Card (for critical/high patients) ────────────────────────────────

function AlertCard({ patient, inf, tran, onExpand }: {
    patient: PatientSummary
    inf: InfusionResult
    tran: TransfusionResult
    onExpand: () => void
}) {
    const isCritical = tran.priority === "critical"
    const borderColor = isCritical ? "border-red-400" : tran.priority === "high" ? "border-red-300" : inf.priority === "high" ? "border-amber-300" : "border-amber-200"
    const bgColor = isCritical ? "bg-red-50" : tran.priority === "high" ? "bg-red-50/60" : "bg-amber-50/60"

    return (
        <div className={`${bgColor} border-2 ${borderColor} rounded-2xl p-5 cursor-pointer hover:shadow-lg transition-all`} onClick={onExpand}>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className={`w-5 h-5 ${isCritical ? "text-red-600" : "text-amber-600"}`} />
                        <h3 className="font-bold text-lg text-slate-900">{patient.last_name}, {patient.first_name}</h3>
                    </div>

                    {/* Key numbers — big and clear */}
                    <div className="flex items-center gap-6 mb-3">
                        {tran.hemoglobin !== undefined && (
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Hemoglobin</p>
                                <p className={`text-2xl font-black ${tran.hemoglobin < 7 ? "text-red-700" : tran.hemoglobin < 8 ? "text-red-600" : tran.hemoglobin < 9 ? "text-amber-600" : "text-slate-700"}`}>
                                    {tran.hemoglobin} <span className="text-sm font-medium">g/dL</span>
                                </p>
                            </div>
                        )}
                        {inf.albumin !== undefined && (
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Albumin</p>
                                <p className={`text-2xl font-black ${inf.albumin < 2.8 ? "text-red-700" : inf.albumin < 3.0 ? "text-red-600" : inf.albumin < 3.5 ? "text-amber-600" : "text-slate-700"}`}>
                                    {inf.albumin} <span className="text-sm font-medium">g/dL</span>
                                </p>
                            </div>
                        )}
                        {tran.hematocrit !== undefined && (
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Hematocrit</p>
                                <p className={`text-2xl font-black ${tran.hematocrit < 25 ? "text-red-600" : "text-slate-700"}`}>
                                    {tran.hematocrit} <span className="text-sm font-medium">%</span>
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Reasons */}
                    <div className="space-y-1.5">
                        {tran.findings.map((f, i) => (
                            <div key={`t${i}`} className="flex items-start gap-2">
                                <FlaskConical className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                                <p className="text-sm text-slate-700"><span className="font-bold text-red-700">{f.test}:</span> {f.reason}</p>
                            </div>
                        ))}
                        {inf.reasons.map((r, i) => (
                            <div key={`i${i}`} className="flex items-start gap-2">
                                <Droplets className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                                <p className="text-sm text-slate-700">{r}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {tran.priority !== "none" && (
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide ${
                            isCritical ? "bg-red-600 text-white" : "bg-red-200 text-red-800"
                        }`}>
                            Transfusion
                        </span>
                    )}
                    {inf.priority !== "none" && inf.priority !== "low" && (
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide ${
                            inf.priority === "high" ? "bg-amber-500 text-white" : "bg-amber-200 text-amber-800"
                        }`}>
                            Infusion
                        </span>
                    )}
                    {patient.lastLabDate && (
                        <p className="text-[10px] text-slate-400 mt-1">Lab: {patient.lastLabDate}</p>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Main view ────────────────────────────────────────────────────────────────

const KEY_LABS_CANONICAL = ["Hemoglobin", "Hematocrit", "Albumin", "Ferritin", "BUN", "Creatinine", "Sodium", "Potassium", "CO2"]

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
    const [showAllPatients, setShowAllPatients] = useState(false)

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

    useEffect(() => { if (facilityName) loadPatients() }, [facilityName, loadPatients])

    const expandPatient = useCallback((simplId: string) => {
        if (expandedId === simplId) { setExpandedId(null); setLabHistory(null); setOpenResources({}); return }
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
        setOpenResources(prev => { const n = { ...prev }; delete n[resource]; return n })
    }, [])

    // Categorize patients
    const analyzed = patients.map(p => {
        const labs = p.labs_latest ?? {}
        return { patient: p, inf: analyzeInfusion(labs), tran: analyzeTransfusion(labs), hasLabs: Object.keys(labs).length > 0 }
    })

    const actionRequired = analyzed.filter(a =>
        a.tran.priority === "critical" || a.tran.priority === "high" ||
        a.inf.priority === "high"
    ).sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3, none: 4 }
        return Math.min(order[a.tran.priority] ?? 4, order[a.inf.priority] ?? 4) - Math.min(order[b.tran.priority] ?? 4, order[b.inf.priority] ?? 4)
    })

    const watchList = analyzed.filter(a =>
        a.inf.priority === "medium" || a.tran.priority === "medium"
    ).sort((a, b) => (b.inf.score) - (a.inf.score))

    const stable = analyzed.filter(a =>
        !actionRequired.includes(a) && !watchList.includes(a)
    )

    if (!facilityName) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
                <Building2 className="w-12 h-12 text-slate-300" />
                <h2 className="text-xl font-semibold text-slate-700">Select a Facility</h2>
                <p className="text-slate-500 max-w-sm">Use the facility dropdown or go to the <button onClick={() => router.push('/dashboard')} className="text-teal-600 underline">dashboard</button>.</p>
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
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

            {loading && <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading patients...</div>}

            {!loading && patients.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-2"><AlertCircle className="w-6 h-6" /><p>No patients found.</p></div>
            )}

            {!loading && patients.length > 0 && (
                <>
                    {/* ═══ ACTION REQUIRED ═══ */}
                    {actionRequired.length > 0 && (
                        <section>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                                    <AlertTriangle className="w-4 h-4 text-red-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-red-800">Action Required</h2>
                                    <p className="text-xs text-red-600">{actionRequired.length} patient{actionRequired.length !== 1 ? 's' : ''} need immediate evaluation for infusion or transfusion</p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {actionRequired.map(({ patient, inf, tran }) => (
                                    <div key={patient.simpl_id}>
                                        <AlertCard patient={patient} inf={inf} tran={tran} onExpand={() => expandPatient(patient.simpl_id)} />
                                        {expandedId === patient.simpl_id && <ExpandedDetail patient={patient} labs={patient.labs_latest ?? {}} labHistory={labHistory} labHistoryLoading={labHistoryLoading} openResources={openResources} fetchResource={fetchResource} closeResource={closeResource} />}
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* ═══ WATCH LIST ═══ */}
                    {watchList.length > 0 && (
                        <section>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                                    <Activity className="w-4 h-4 text-amber-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-amber-800">Watch List</h2>
                                    <p className="text-xs text-amber-600">{watchList.length} patient{watchList.length !== 1 ? 's' : ''} with abnormal values — monitor and reassess</p>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                                            <th className="text-left px-4 py-3">Patient</th>
                                            <th className="text-center px-3 py-3">Hgb</th>
                                            <th className="text-center px-3 py-3">Alb</th>
                                            <th className="text-left px-3 py-3">Flags</th>
                                            <th className="text-right px-4 py-3">Last Lab</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {watchList.map(({ patient, inf, tran }) => {
                                            const hgb = tran.hemoglobin
                                            const alb = inf.albumin
                                            return (
                                                <tr key={patient.simpl_id} className="border-b border-slate-100 hover:bg-amber-50/30 cursor-pointer transition-colors" onClick={() => expandPatient(patient.simpl_id)}>
                                                    <td className="px-4 py-3">
                                                        <p className="font-semibold text-sm text-slate-800">{patient.last_name}, {patient.first_name}</p>
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        {hgb !== undefined ? (
                                                            <span className={`text-sm font-bold ${hgb < 9 ? "text-red-600" : hgb < 11 ? "text-amber-600" : "text-slate-700"}`}>{hgb}</span>
                                                        ) : <span className="text-slate-300">—</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        {alb !== undefined ? (
                                                            <span className={`text-sm font-bold ${alb < 3.0 ? "text-red-600" : alb < 3.5 ? "text-amber-600" : "text-slate-700"}`}>{alb}</span>
                                                        ) : <span className="text-slate-300">—</span>}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <div className="flex gap-1.5 flex-wrap">
                                                            {inf.priority !== "none" && inf.priority !== "low" && (
                                                                <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-md">Infusion</span>
                                                            )}
                                                            {tran.priority !== "none" && (
                                                                <span className="px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded-md">Transfusion</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-xs text-slate-400">{patient.lastLabDate ?? '—'}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {watchList.some(w => expandedId === w.patient.simpl_id) && (() => {
                                const w = watchList.find(w => expandedId === w.patient.simpl_id)!
                                return <ExpandedDetail patient={w.patient} labs={w.patient.labs_latest ?? {}} labHistory={labHistory} labHistoryLoading={labHistoryLoading} openResources={openResources} fetchResource={fetchResource} closeResource={closeResource} />
                            })()}
                        </section>
                    )}

                    {/* ═══ ALL OTHER PATIENTS ═══ */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                                    <Users className="w-4 h-4 text-slate-500" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-700">All Patients</h2>
                                    <p className="text-xs text-slate-500">{stable.length} patient{stable.length !== 1 ? 's' : ''} with no immediate concerns</p>
                                </div>
                            </div>
                            <button onClick={() => setShowAllPatients(p => !p)} className="text-sm font-medium text-teal-600 hover:text-teal-700">
                                {showAllPatients ? 'Hide' : 'Show'}
                            </button>
                        </div>

                        {showAllPatients && (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                                            <th className="text-left px-4 py-3">Patient</th>
                                            <th className="text-center px-3 py-3">Hgb</th>
                                            <th className="text-center px-3 py-3">Alb</th>
                                            <th className="text-center px-3 py-3">Na</th>
                                            <th className="text-center px-3 py-3">K</th>
                                            <th className="text-center px-3 py-3">BUN</th>
                                            <th className="text-right px-4 py-3">Last Lab</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stable.map(({ patient, inf }) => {
                                            const labs = patient.labs_latest ?? {}
                                            const hgb = labLookup(labs, "Hemoglobin")?.value
                                            const alb = inf.albumin
                                            const na = labLookup(labs, "Sodium")?.value
                                            const k = labLookup(labs, "Potassium")?.value
                                            const bun = labLookup(labs, "BUN")?.value
                                            return (
                                                <tr key={patient.simpl_id} className="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-colors" onClick={() => expandPatient(patient.simpl_id)}>
                                                    <td className="px-4 py-2.5">
                                                        <p className="font-medium text-sm text-slate-700">{patient.last_name}, {patient.first_name}</p>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-center text-sm text-slate-600">{hgb ?? '—'}</td>
                                                    <td className="px-3 py-2.5 text-center text-sm text-slate-600">{alb ?? '—'}</td>
                                                    <td className="px-3 py-2.5 text-center text-sm text-slate-600">{na ?? '—'}</td>
                                                    <td className="px-3 py-2.5 text-center text-sm text-slate-600">{k ?? '—'}</td>
                                                    <td className="px-3 py-2.5 text-center text-sm text-slate-600">{bun ?? '—'}</td>
                                                    <td className="px-4 py-2.5 text-right text-xs text-slate-400">{patient.lastLabDate ?? '—'}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {showAllPatients && stable.some(s => expandedId === s.patient.simpl_id) && (() => {
                            const s = stable.find(s => expandedId === s.patient.simpl_id)!
                            return <ExpandedDetail patient={s.patient} labs={s.patient.labs_latest ?? {}} labHistory={labHistory} labHistoryLoading={labHistoryLoading} openResources={openResources} fetchResource={fetchResource} closeResource={closeResource} />
                        })()}
                    </section>
                </>
            )}
        </div>
    )
}

// ─── Expanded Detail (shared by all sections) ────────────────────────────────

function ExpandedDetail({ patient, labs, labHistory, labHistoryLoading, openResources, fetchResource, closeResource }: {
    patient: PatientSummary
    labs: Record<string, LabValue>
    labHistory: Record<string, unknown> | null
    labHistoryLoading: boolean
    openResources: Record<string, ResourceState>
    fetchResource: (simplId: string, resource: string) => void
    closeResource: (resource: string) => void
}) {
    const keyLabs = KEY_LABS_CANONICAL.map(canonical => {
        const lab = labLookup(labs, canonical)
        if (!lab) return null
        return { canonical, lab }
    }).filter(Boolean) as Array<{ canonical: string; lab: LabValue }>

    const NORMAL: Record<string, [number, number]> = {
        Hemoglobin: [11.0, 16.0], Hematocrit: [34, 45], Albumin: [3.4, 5.0],
        BUN: [7, 23], Creatinine: [0.6, 1.2], Sodium: [136, 145],
        Potassium: [3.5, 5.0], CO2: [23, 29], Ferritin: [30, 400],
    }

    return (
        <div className="mt-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <p className="font-bold text-sm text-slate-700">{patient.last_name}, {patient.first_name} — Detail</p>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    {patient.lastLabDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Last: {patient.lastLabDate}</span>}
                    {patient.reportCount != null && <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{patient.reportCount} reports</span>}
                </div>
            </div>

            {/* Lab values table */}
            {keyLabs.length > 0 && (
                <div className="px-5 py-4 border-b border-slate-100">
                    <table className="w-full text-sm">
                        <thead><tr className="text-[10px] text-slate-400 uppercase font-bold">
                            <th className="text-left pb-2">Test</th>
                            <th className="text-right pb-2">Value</th>
                            <th className="text-right pb-2">Normal Range</th>
                            <th className="text-right pb-2">Date</th>
                            <th className="text-right pb-2">Status</th>
                        </tr></thead>
                        <tbody>
                            {keyLabs.map(({ canonical, lab }) => {
                                const range = NORMAL[canonical]
                                const abnormal = range ? (lab.value < range[0] || lab.value > range[1]) : false
                                return (
                                    <tr key={canonical} className={`border-t border-slate-50 ${abnormal ? "bg-red-50/50" : ""}`}>
                                        <td className="py-1.5 font-medium text-slate-700">{canonical}</td>
                                        <td className={`py-1.5 text-right font-bold ${abnormal ? "text-red-700" : "text-slate-800"}`}>{lab.value} <span className="text-slate-400 font-normal text-xs">{lab.unit}</span></td>
                                        <td className="py-1.5 text-right text-xs text-slate-400">{lab.referenceRange || (range ? `${range[0]}–${range[1]}` : '—')}</td>
                                        <td className="py-1.5 text-right text-xs text-slate-400">{lab.date}</td>
                                        <td className="py-1.5 text-right">
                                            {abnormal
                                                ? <span className="px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded-md">ABNORMAL</span>
                                                : <span className="px-2 py-0.5 text-[10px] font-bold bg-green-100 text-green-700 rounded-md">NORMAL</span>
                                            }
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Trend charts */}
            {labHistoryLoading && <div className="px-5 py-6 text-center text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading trends...</div>}

            {!labHistoryLoading && labHistory && Object.keys(labHistory).length > 0 && (() => {
                const histMap = labHistory as Record<string, Array<{ date: string; value: number; referenceRange?: string }>>
                const charts = KEY_LABS_CANONICAL.map(canonical => {
                    const aliases = LAB_ALIASES[canonical] ?? [canonical]
                    const key = aliases.find(a => histMap[a] && histMap[a].length >= 2)
                    if (!key) return null
                    const latestLab = labLookup(labs, canonical)
                    return { canonical, history: histMap[key], refRange: histMap[key][0]?.referenceRange ?? latestLab?.referenceRange }
                }).filter(Boolean) as Array<{ canonical: string; history: Array<{ date: string; value: number }>; refRange?: string }>
                if (charts.length === 0) return null
                return (
                    <div className="px-5 py-4 border-b border-slate-100">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-3">Trends</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {charts.map(c => <LabTrendChart key={c.canonical} name={c.canonical} history={c.history} refRange={c.refRange} />)}
                        </div>
                    </div>
                )
            })()}

            {/* Resources */}
            <div className="px-5 py-4">
                <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" />Raw Data</p>
                <div className="flex flex-wrap gap-2 mb-3">
                    {patient.resources.map(resource => {
                        const rs = openResources[resource]
                        const isActive = !!rs
                        return (
                            <button key={resource} onClick={() => isActive ? closeResource(resource) : fetchResource(patient.simpl_id, resource)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${isActive ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400'}`}>
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
                            <button onClick={() => closeResource(resource)} className="p-1 text-slate-400 hover:text-red-600"><X className="w-3 h-3" /></button>
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
    )
}

export default function PatientsPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center py-32 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...</div>}>
            <PatientsView />
        </Suspense>
    )
}
