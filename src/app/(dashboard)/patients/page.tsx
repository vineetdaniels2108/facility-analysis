"use client"

import { useState, useEffect, useCallback, Suspense, useRef, Fragment } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
    Users, ChevronRight, ChevronDown, Loader2, RefreshCw,
    Building2, AlertTriangle, Droplets, FlaskConical,
    Activity, Calendar, ClipboardList, FileText, X, AlertCircle,
    Search, ArrowUpDown, ChevronUp, TrendingDown, Eye
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

// ─── Combined severity ──────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium" | "low" | "normal"

function combinedSeverity(inf: InfusionResult, tran: TransfusionResult): Severity {
    if (tran.priority === "critical") return "critical"
    if (tran.priority === "high" || inf.priority === "high") return "high"
    if (tran.priority === "medium" || inf.priority === "medium") return "medium"
    if (inf.priority === "low") return "low"
    return "normal"
}

function severityUrgencyScore(sev: Severity, inf: InfusionResult): number {
    const base = { critical: 1000, high: 500, medium: 200, low: 50, normal: 0 }
    return base[sev] + inf.score
}

const SEVERITY_BADGE: Record<Severity, { label: string; className: string }> = {
    critical: { label: "CRITICAL", className: "bg-red-600 text-white" },
    high: { label: "HIGH", className: "bg-red-100 text-red-800" },
    medium: { label: "MEDIUM", className: "bg-amber-100 text-amber-800" },
    low: { label: "LOW", className: "bg-blue-50 text-blue-700" },
    normal: { label: "OK", className: "bg-emerald-50 text-emerald-700" },
}

// ─── Trend chart (compact) ──────────────────────────────────────────────────

function LabTrendChart({ name, history, refRange }: { name: string; history: Array<{ date: string; value: number }>; refRange?: string }) {
    const data = history.map(h => ({ date: h.date.slice(5), value: h.value, fullDate: h.date }))
    let refLow: number | undefined, refHigh: number | undefined
    if (refRange) {
        const m = refRange.match(/([\d.]+)\s*[-–]\s*([\d.]+)/)
        if (m) { refLow = parseFloat(m[1]); refHigh = parseFloat(m[2]) }
    }
    return (
        <div className="bg-slate-50/80 border border-slate-100 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-semibold text-slate-600">{name}</p>
                {refRange && <p className="text-[9px] text-slate-400">{refRange}</p>}
            </div>
            <ResponsiveContainer width="100%" height={90}>
                <LineChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 8 }} />
                    <YAxis tick={{ fontSize: 8 }} width={30} domain={["auto", "auto"]} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <RechartsTooltip contentStyle={{ fontSize: 10, padding: '4px 8px' }} formatter={(val: any) => [String(val ?? ''), name]} labelFormatter={(_l: any, p: any) => p?.[0]?.payload?.fullDate ?? String(_l ?? '')} />
                    {refLow !== undefined && <ReferenceLine y={refLow} stroke="#94a3b8" strokeDasharray="3 3" />}
                    {refHigh !== undefined && <ReferenceLine y={refHigh} stroke="#94a3b8" strokeDasharray="3 3" />}
                    <Line type="monotone" dataKey="value" stroke="#0d9488" strokeWidth={1.5} dot={{ r: 1.5 }} activeDot={{ r: 3 }} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}

// ─── Types & sort ─────────────────────────────────────────────────────────────

type FilterType = "all" | "critical" | "high" | "medium" | "low" | "infusion" | "transfusion" | "no-labs"
type SortType = "urgency" | "name-az" | "name-za" | "lab-date-new" | "lab-date-old" | "hgb-low" | "alb-low"

interface AnalyzedPatient {
    patient: PatientSummary
    inf: InfusionResult
    tran: TransfusionResult
    hasLabs: boolean
    severity: Severity
    urgencyScore: number
}

const SORT_OPTIONS: { value: SortType; label: string }[] = [
    { value: "urgency", label: "Most Urgent" },
    { value: "hgb-low", label: "Lowest Hgb" },
    { value: "alb-low", label: "Lowest Alb" },
    { value: "lab-date-new", label: "Recent Lab" },
    { value: "lab-date-old", label: "Oldest Lab" },
    { value: "name-az", label: "Name A→Z" },
    { value: "name-za", label: "Name Z→A" },
]

function sortPatients(list: AnalyzedPatient[], sort: SortType): AnalyzedPatient[] {
    return [...list].sort((a, b) => {
        switch (sort) {
            case "urgency": return b.urgencyScore - a.urgencyScore
            case "name-az": return a.patient.last_name.localeCompare(b.patient.last_name)
            case "name-za": return b.patient.last_name.localeCompare(a.patient.last_name)
            case "lab-date-new": return (b.patient.lastLabDate ?? "").localeCompare(a.patient.lastLabDate ?? "")
            case "lab-date-old": return (a.patient.lastLabDate ?? "").localeCompare(b.patient.lastLabDate ?? "")
            case "hgb-low": return (a.tran.hemoglobin ?? 999) - (b.tran.hemoglobin ?? 999)
            case "alb-low": return (a.inf.albumin ?? 999) - (b.inf.albumin ?? 999)
            default: return 0
        }
    })
}

const KEY_LABS_CANONICAL = ["Hemoglobin", "Hematocrit", "Albumin", "Ferritin", "BUN", "Creatinine", "Sodium", "Potassium", "CO2"]

const NORMAL: Record<string, [number, number]> = {
    Hemoglobin: [11.0, 16.0], Hematocrit: [34, 45], Albumin: [3.4, 5.0],
    BUN: [7, 23], Creatinine: [0.6, 1.2], Sodium: [136, 145],
    Potassium: [3.5, 5.0], CO2: [23, 29], Ferritin: [30, 400],
}

// ─── Lab value pill ──────────────────────────────────────────────────────────

function LabPill({ value, low, high, unit }: { value?: number; low: number; high: number; unit?: string }) {
    if (value === undefined) return <span className="text-slate-300 text-xs">—</span>
    const abnormal = value < low || value > high
    const critical = value < low * 0.85
    return (
        <span className={`text-xs font-bold tabular-nums ${critical ? "text-red-700" : abnormal ? "text-amber-600" : "text-slate-600"}`}>
            {value}{unit && <span className="text-[9px] font-normal text-slate-400 ml-0.5">{unit}</span>}
        </span>
    )
}

// ─── Inline Detail Row ───────────────────────────────────────────────────────

function InlineDetail({ patient, labs, labHistory, labHistoryLoading, openResources, fetchResource, closeResource, colSpan }: {
    patient: PatientSummary
    labs: Record<string, LabValue>
    labHistory: Record<string, unknown> | null
    labHistoryLoading: boolean
    openResources: Record<string, ResourceState>
    fetchResource: (simplId: string, resource: string) => void
    closeResource: (resource: string) => void
    colSpan: number
}) {
    const panelRef = useRef<HTMLTableRowElement>(null)
    const [activeTab, setActiveTab] = useState<"labs" | "trends" | "data">("labs")

    useEffect(() => {
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }, [patient.simpl_id])

    const keyLabs = KEY_LABS_CANONICAL.map(canonical => {
        const lab = labLookup(labs, canonical)
        if (!lab) return null
        return { canonical, lab }
    }).filter(Boolean) as Array<{ canonical: string; lab: LabValue }>

    const histMap = (labHistory ?? {}) as Record<string, Array<{ date: string; value: number; referenceRange?: string }>>
    const charts = KEY_LABS_CANONICAL.map(canonical => {
        const aliases = LAB_ALIASES[canonical] ?? [canonical]
        const key = aliases.find(a => histMap[a] && histMap[a].length >= 2)
        if (!key) return null
        const latestLab = labLookup(labs, canonical)
        return { canonical, history: histMap[key], refRange: histMap[key][0]?.referenceRange ?? latestLab?.referenceRange }
    }).filter(Boolean) as Array<{ canonical: string; history: Array<{ date: string; value: number }>; refRange?: string }>

    const tabs = [
        { id: "labs" as const, label: "Labs", count: keyLabs.length },
        { id: "trends" as const, label: "Trends", count: labHistoryLoading ? -1 : charts.length },
        { id: "data" as const, label: "Raw Data", count: patient.resources.length },
    ]

    return (
        <tr ref={panelRef} className="bg-slate-50/50">
            <td colSpan={colSpan} className="p-0">
                <div className="mx-3 my-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Header + tabs on the same line */}
                    <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <p className="font-bold text-sm text-slate-800">{patient.last_name}, {patient.first_name}</p>
                            <div className="flex items-center gap-3 text-[10px] text-slate-400">
                                {patient.lastLabDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{patient.lastLabDate}</span>}
                                {patient.reportCount != null && <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{patient.reportCount} rpts</span>}
                            </div>
                        </div>
                        <div className="flex items-center gap-0">
                            {tabs.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setActiveTab(t.id)}
                                    className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors ${activeTab === t.id
                                        ? "bg-teal-50 text-teal-700"
                                        : "text-slate-400 hover:text-slate-600"}`}
                                >
                                    {t.label}
                                    {t.count > 0 && <span className="ml-1 text-[9px] bg-slate-100 text-slate-500 px-1 rounded">{t.count}</span>}
                                    {t.count === -1 && <Loader2 className="w-2.5 h-2.5 animate-spin inline ml-1" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tab content */}
                    <div className="max-h-[380px] overflow-y-auto">
                        {activeTab === "labs" && keyLabs.length > 0 && (
                            <div className="p-3">
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5">
                                    {keyLabs.map(({ canonical, lab }) => {
                                        const range = NORMAL[canonical]
                                        const abnormal = range ? (lab.value < range[0] || lab.value > range[1]) : false
                                        return (
                                            <div key={canonical} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border ${abnormal ? "bg-red-50/60 border-red-200" : "bg-slate-50/60 border-slate-100"}`}>
                                                <div>
                                                    <p className="text-[10px] font-semibold text-slate-400">{canonical}</p>
                                                    <p className={`text-sm font-black leading-tight ${abnormal ? "text-red-700" : "text-slate-800"}`}>
                                                        {lab.value} <span className="text-[9px] font-normal text-slate-400">{lab.unit}</span>
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    {abnormal
                                                        ? <span className="px-1 py-0.5 text-[8px] font-bold bg-red-100 text-red-700 rounded">ABN</span>
                                                        : <span className="px-1 py-0.5 text-[8px] font-bold bg-green-100 text-green-700 rounded">OK</span>}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {activeTab === "labs" && keyLabs.length === 0 && (
                            <div className="p-6 text-center text-xs text-slate-400">No lab data available.</div>
                        )}

                        {activeTab === "trends" && (
                            <div className="p-3">
                                {labHistoryLoading && <div className="py-4 text-center text-slate-400 text-xs"><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Loading trends...</div>}
                                {!labHistoryLoading && charts.length > 0 && (
                                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                                        {charts.map(c => <LabTrendChart key={c.canonical} name={c.canonical} history={c.history} refRange={c.refRange} />)}
                                    </div>
                                )}
                                {!labHistoryLoading && charts.length === 0 && (
                                    <div className="py-4 text-center text-xs text-slate-400">Not enough historical data for trend charts.</div>
                                )}
                            </div>
                        )}

                        {activeTab === "data" && (
                            <div className="p-3">
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {patient.resources.map(resource => {
                                        const rs = openResources[resource]
                                        const isActive = !!rs
                                        return (
                                            <button key={resource} onClick={(e) => { e.stopPropagation(); isActive ? closeResource(resource) : fetchResource(patient.simpl_id, resource) }}
                                                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border transition-all ${isActive ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400'}`}>
                                                {rs?.loading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : isActive ? <X className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
                                                {resource}
                                            </button>
                                        )
                                    })}
                                </div>
                                {Object.entries(openResources).map(([resource, rs]) => (
                                    <div key={resource} className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-2">
                                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 bg-slate-50/80">
                                            <span className="text-[10px] font-semibold text-slate-700">{resource}</span>
                                            <button onClick={() => closeResource(resource)} className="p-0.5 text-slate-400 hover:text-red-600"><X className="w-3 h-3" /></button>
                                        </div>
                                        <div className="p-2 max-h-56 overflow-y-auto">
                                            {rs.loading && <div className="text-xs text-slate-400 py-2 text-center"><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Loading...</div>}
                                            {rs.error && <div className="text-xs text-red-600 bg-red-50 rounded p-2"><AlertCircle className="w-3 h-3 inline mr-1" />{rs.error}</div>}
                                            {rs.data != null && !rs.loading && <ResourceDataRenderer resource={resource} data={rs.data} />}
                                        </div>
                                    </div>
                                ))}
                                {Object.keys(openResources).length === 0 && (
                                    <p className="text-[10px] text-slate-400 text-center py-3">Select a resource above to view raw data.</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </td>
        </tr>
    )
}

// ─── Main view ────────────────────────────────────────────────────────────────

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

    const [searchQuery, setSearchQuery] = useState("")
    const [activeFilter, setActiveFilter] = useState<FilterType>("all")
    const [sortBy, setSortBy] = useState<SortType>("urgency")
    const [showSortMenu, setShowSortMenu] = useState(false)

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

    // Analyze all patients with fixed severity scoring
    const analyzed: AnalyzedPatient[] = patients.map(p => {
        const labs = p.labs_latest ?? {}
        const inf = analyzeInfusion(labs)
        const tran = analyzeTransfusion(labs)
        const hasLabs = Object.keys(labs).length > 0
        const severity = combinedSeverity(inf, tran)
        const urgencyScore = severityUrgencyScore(severity, inf)
        return { patient: p, inf, tran, hasLabs, severity, urgencyScore }
    })

    const counts = {
        all: analyzed.length,
        critical: analyzed.filter(a => a.severity === "critical").length,
        high: analyzed.filter(a => a.severity === "high").length,
        medium: analyzed.filter(a => a.severity === "medium").length,
        low: analyzed.filter(a => a.severity === "low").length,
        infusion: analyzed.filter(a => a.inf.priority !== "none" && a.inf.priority !== "low").length,
        transfusion: analyzed.filter(a => a.tran.priority !== "none").length,
        "no-labs": analyzed.filter(a => !a.hasLabs).length,
    }

    const searched = searchQuery.trim()
        ? analyzed.filter(a => {
            const q = searchQuery.toLowerCase()
            return a.patient.first_name.toLowerCase().includes(q)
                || a.patient.last_name.toLowerCase().includes(q)
                || a.patient.simpl_id.includes(q)
        })
        : analyzed

    const filtered = searched.filter(a => {
        switch (activeFilter) {
            case "critical": return a.severity === "critical"
            case "high": return a.severity === "high"
            case "medium": return a.severity === "medium"
            case "low": return a.severity === "low"
            case "infusion": return a.inf.priority !== "none" && a.inf.priority !== "low"
            case "transfusion": return a.tran.priority !== "none"
            case "no-labs": return !a.hasLabs
            default: return true
        }
    })

    const sorted = sortPatients(filtered, sortBy)
    const COL_SPAN = 13

    if (!facilityName) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
                <Building2 className="w-12 h-12 text-slate-300" />
                <h2 className="text-xl font-semibold text-slate-700">Select a Facility</h2>
                <p className="text-slate-500 max-w-sm">Use the facility dropdown or go to the <button onClick={() => router.push('/dashboard')} className="text-teal-600 underline">dashboard</button>.</p>
            </div>
        )
    }

    const FILTERS: { key: FilterType; label: string; icon: React.ReactNode; color: string; activeColor: string }[] = [
        { key: "all", label: "All", icon: <Users className="w-3 h-3" />, color: "text-slate-600 border-slate-200 hover:bg-slate-50", activeColor: "text-white bg-slate-700 border-slate-700" },
        { key: "critical", label: "Critical", icon: <AlertTriangle className="w-3 h-3" />, color: "text-red-600 border-red-200 hover:bg-red-50", activeColor: "text-white bg-red-600 border-red-600" },
        { key: "high", label: "High", icon: <TrendingDown className="w-3 h-3" />, color: "text-red-500 border-red-200 hover:bg-red-50", activeColor: "text-white bg-red-500 border-red-500" },
        { key: "medium", label: "Medium", icon: <Eye className="w-3 h-3" />, color: "text-amber-600 border-amber-200 hover:bg-amber-50", activeColor: "text-white bg-amber-500 border-amber-500" },
        { key: "infusion", label: "Infusion", icon: <Droplets className="w-3 h-3" />, color: "text-blue-600 border-blue-200 hover:bg-blue-50", activeColor: "text-white bg-blue-600 border-blue-600" },
        { key: "transfusion", label: "Transfusion", icon: <FlaskConical className="w-3 h-3" />, color: "text-rose-600 border-rose-200 hover:bg-rose-50", activeColor: "text-white bg-rose-600 border-rose-600" },
    ]

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* ─── Compact header + stats ─── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center border border-teal-200/50">
                        <Users className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-tight">{facilityName}</h1>
                        <p className="text-slate-400 text-xs">{loading ? 'Loading...' : `${patients.length} patients`}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!loading && patients.length > 0 && (
                        <div className="flex items-center gap-1.5 mr-2">
                            {counts.critical > 0 && (
                                <div className="flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-200 rounded-lg">
                                    <AlertTriangle className="w-3 h-3 text-red-600" />
                                    <span className="text-xs font-bold text-red-700">{counts.critical}</span>
                                    <span className="text-[9px] text-red-500">crit</span>
                                </div>
                            )}
                            {counts.high > 0 && (
                                <div className="flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-100 rounded-lg">
                                    <span className="text-xs font-bold text-red-600">{counts.high}</span>
                                    <span className="text-[9px] text-red-400">high</span>
                                </div>
                            )}
                            {counts.medium > 0 && (
                                <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg">
                                    <span className="text-xs font-bold text-amber-700">{counts.medium}</span>
                                    <span className="text-[9px] text-amber-500">med</span>
                                </div>
                            )}
                        </div>
                    )}
                    <button onClick={loadPatients} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 hover:border-teal-400 hover:text-teal-600 text-slate-600 rounded-lg transition-colors shadow-sm disabled:opacity-50">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* ─── Search + Filter + Sort ─── */}
            {!loading && patients.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search patients..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 shadow-sm"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600">
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    <div className="h-5 w-px bg-slate-200" />

                    {FILTERS.map(f => (
                        <button
                            key={f.key}
                            onClick={() => setActiveFilter(f.key)}
                            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${activeFilter === f.key ? f.activeColor : f.color}`}
                        >
                            {f.icon}
                            {f.label}
                            {counts[f.key] > 0 && (
                                <span className={`ml-0.5 px-1 py-0 rounded text-[9px] font-bold ${activeFilter === f.key ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"}`}>
                                    {counts[f.key]}
                                </span>
                            )}
                        </button>
                    ))}

                    <div className="h-5 w-px bg-slate-200" />

                    <div className="relative">
                        <button
                            onClick={() => setShowSortMenu(v => !v)}
                            className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                        >
                            <ArrowUpDown className="w-3 h-3" />
                            {SORT_OPTIONS.find(s => s.value === sortBy)?.label}
                            {showSortMenu ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                        </button>
                        {showSortMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                                <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50">
                                    {SORT_OPTIONS.map(s => (
                                        <button
                                            key={s.value}
                                            onClick={() => { setSortBy(s.value); setShowSortMenu(false) }}
                                            className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-slate-50 transition-colors ${sortBy === s.value ? "font-bold text-teal-700 bg-teal-50/50" : "text-slate-600"}`}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {(searchQuery || activeFilter !== "all") && (
                        <span className="text-[10px] text-slate-400 ml-1">{sorted.length}/{patients.length}</span>
                    )}
                </div>
            )}

            {loading && <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading patients...</div>}

            {!loading && patients.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-2"><AlertCircle className="w-6 h-6" /><p>No patients found.</p></div>
            )}

            {!loading && patients.length > 0 && sorted.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
                    <Search className="w-5 h-5" />
                    <p className="text-sm">No patients match your search or filters.</p>
                    <button onClick={() => { setSearchQuery(""); setActiveFilter("all") }} className="text-xs text-teal-600 hover:text-teal-700 font-medium">Clear filters</button>
                </div>
            )}

            {/* ─── Patient table with inline expand ─── */}
            {!loading && sorted.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <th className="text-left pl-4 pr-1 py-2.5 w-6"></th>
                                <th className="text-left px-2 py-2.5">Patient</th>
                                <th className="text-center px-2 py-2.5">Severity</th>
                                <th className="text-center px-2 py-2.5">Hgb</th>
                                <th className="text-center px-2 py-2.5">Alb</th>
                                <th className="text-center px-2 py-2.5 hidden md:table-cell">Hct</th>
                                <th className="text-center px-2 py-2.5 hidden lg:table-cell">Na</th>
                                <th className="text-center px-2 py-2.5 hidden lg:table-cell">K</th>
                                <th className="text-center px-2 py-2.5 hidden lg:table-cell">BUN</th>
                                <th className="text-center px-2 py-2.5 hidden lg:table-cell">Creat</th>
                                <th className="text-left px-2 py-2.5 hidden md:table-cell">Flags</th>
                                <th className="text-right px-2 py-2.5 hidden sm:table-cell">Last Lab</th>
                                <th className="w-6 pr-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map(({ patient, inf, tran, severity, hasLabs }) => {
                                const labs = patient.labs_latest ?? {}
                                const hgb = tran.hemoglobin
                                const alb = inf.albumin
                                const hct = tran.hematocrit
                                const na = labLookup(labs, "Sodium")?.value
                                const k = labLookup(labs, "Potassium")?.value
                                const bun = labLookup(labs, "BUN")?.value
                                const creat = labLookup(labs, "Creatinine")?.value
                                const isExpanded = expandedId === patient.simpl_id

                                const rowAccent = severity === "critical"
                                    ? "border-l-[3px] border-l-red-500"
                                    : severity === "high"
                                    ? "border-l-[3px] border-l-red-300"
                                    : severity === "medium"
                                    ? "border-l-[3px] border-l-amber-400"
                                    : "border-l-[3px] border-l-transparent"

                                const badge = SEVERITY_BADGE[severity]

                                return (
                                    <Fragment key={patient.simpl_id}>
                                        <tr
                                            className={`border-b border-slate-50 hover:bg-slate-50/60 cursor-pointer transition-colors ${rowAccent} ${isExpanded ? "bg-teal-50/40 !border-b-0" : ""}`}
                                            onClick={() => expandPatient(patient.simpl_id)}
                                        >
                                            <td className="pl-4 pr-1 py-2">
                                                {severity === "critical" ? (
                                                    <span className="relative flex h-2.5 w-2.5">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                                                    </span>
                                                ) : severity === "high" ? (
                                                    <span className="inline-flex rounded-full h-2.5 w-2.5 bg-red-400"></span>
                                                ) : severity === "medium" ? (
                                                    <span className="inline-flex rounded-full h-2.5 w-2.5 bg-amber-400"></span>
                                                ) : (
                                                    <span className="inline-flex rounded-full h-2 w-2 bg-slate-200"></span>
                                                )}
                                            </td>
                                            <td className="px-2 py-2">
                                                <p className={`text-sm leading-tight ${severity === "critical" || severity === "high" ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>
                                                    {patient.last_name}, {patient.first_name}
                                                </p>
                                            </td>
                                            <td className="px-2 py-2 text-center">
                                                {hasLabs ? (
                                                    <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${badge.className}`}>
                                                        {badge.label}
                                                    </span>
                                                ) : (
                                                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-slate-100 text-slate-500 rounded">NO LABS</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-2 text-center"><LabPill value={hgb} low={11} high={16} /></td>
                                            <td className="px-2 py-2 text-center"><LabPill value={alb} low={3.4} high={5} /></td>
                                            <td className="px-2 py-2 text-center hidden md:table-cell"><LabPill value={hct} low={34} high={45} unit="%" /></td>
                                            <td className="px-2 py-2 text-center hidden lg:table-cell"><LabPill value={na} low={136} high={145} /></td>
                                            <td className="px-2 py-2 text-center hidden lg:table-cell"><LabPill value={k} low={3.5} high={5} /></td>
                                            <td className="px-2 py-2 text-center hidden lg:table-cell"><LabPill value={bun} low={7} high={23} /></td>
                                            <td className="px-2 py-2 text-center hidden lg:table-cell"><LabPill value={creat} low={0.6} high={1.2} /></td>
                                            <td className="px-2 py-2 hidden md:table-cell">
                                                <div className="flex gap-1 flex-wrap">
                                                    {tran.priority !== "none" && (
                                                        <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${tran.priority === "critical" ? "bg-red-600 text-white" : "bg-red-100 text-red-700"}`}>
                                                            {tran.priority === "critical" ? "TRANSFUSE" : "Transfusion"}
                                                        </span>
                                                    )}
                                                    {inf.priority !== "none" && inf.priority !== "low" && (
                                                        <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${inf.priority === "high" ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-700"}`}>
                                                            Infusion
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-2 py-2 text-right text-[10px] text-slate-400 hidden sm:table-cell tabular-nums">{patient.lastLabDate ?? '—'}</td>
                                            <td className="pr-3 py-2">{isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-teal-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}</td>
                                        </tr>
                                        {isExpanded && (
                                            <InlineDetail
                                                patient={patient}
                                                labs={labs}
                                                labHistory={labHistory}
                                                labHistoryLoading={labHistoryLoading}
                                                openResources={openResources}
                                                fetchResource={fetchResource}
                                                closeResource={closeResource}
                                                colSpan={COL_SPAN}
                                            />
                                        )}
                                    </Fragment>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
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
