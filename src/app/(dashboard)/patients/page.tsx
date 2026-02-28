"use client"

import { useState, useEffect, useCallback, Suspense, useRef, Fragment } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import {
    Users, ChevronRight, ChevronDown, Loader2, RefreshCw,
    Building2, AlertTriangle, Droplets, FlaskConical,
    FileText, X, AlertCircle,
    Search, ArrowUpDown, ChevronUp, TrendingDown, Eye,
    Bed, Clock, UserCheck, UserX,
    Syringe, Utensils, Apple, ShieldAlert,
} from "lucide-react"

const ResourceDataRenderer = dynamic(
    () => import("@/components/data/ResourceDataRenderer").then(m => m.ResourceDataRenderer),
    { ssr: false, loading: () => <div className="text-xs text-slate-400 py-2">Loading...</div> }
)

// ─── Types ────────────────────────────────────────────────────────────────────

interface LabValue {
    date: string
    value: number
    unit: string
    referenceRange: string
}

interface DbAnalysis {
    severity: string
    score: number
    priority: string
    reasoning: string
    indicators: Record<string, unknown>
}

interface PatientSummary {
    simpl_id: string
    first_name: string
    last_name: string
    facility?: string
    fac_id?: number
    // Demographics
    date_of_birth?: string
    patient_status?: string
    room?: string
    bed?: string
    unit?: string
    admit_date?: string
    days_in_facility?: number
    last_synced_at?: string
    // DB pre-computed analysis (5 rule-based + 5 AI modules)
    db_analysis?: Record<string, DbAnalysis | null>
    combined_urgency?: number
    data_source?: string
    // Legacy local data fields
    resources?: string[]
    firstLabDate?: string
    lastLabDate?: string
    reportCount?: number
    labs_latest?: Record<string, LabValue>
}

interface InfusionResult {
    priority: "high" | "medium" | "low" | "none"
    score: number
    reasons: string[]
    albumin?: number
}

interface TransfusionResult {
    priority: "critical" | "high" | "medium" | "none"
    hemoglobin?: number
    hematocrit?: number
    findings: Array<{ test: string; value: number; unit: string; reason: string }>
}

interface ResourceState {
    loading: boolean
    data: unknown
    error: string | null
}

// ─── Lab alias resolver ──────────────────────────────────────────────────────

const LAB_ALIASES: Record<string, string[]> = {
    Hemoglobin: ["HGB", "Hemoglobin", "HEMOGLOBIN"],
    Hematocrit: ["HCT", "Hematocrit", "HEMATOCRIT"],
    Albumin: ["ALB", "Albumin", "ALBUMIN"],
    Ferritin: ["FERRITIN", "Ferritin", "FE"],
    BUN: ["BUN", "Blood Urea Nitrogen"],
    Creatinine: ["CREAT", "Creatinine", "CREATININE"],
    Sodium: ["NA", "Sodium", "SODIUM", "Na"],
    Potassium: ["K", "Potassium", "POTASSIUM"],
    CO2: ["CO2", "Carbon Dioxide", "Bicarbonate"],
    Chloride: ["CHLORIDE", "Chloride"],
    "Anion Gap": ["ANION_GAP", "Anion Gap", "ANION GAP"],
    Calcium: ["CA", "Calcium", "CALCIUM"],
    Magnesium: ["MG", "Magnesium", "MAGNESIUM"],
    Phosphorus: ["PHOS", "Phosphorus", "PHOSPHORUS"],
    Glucose: ["GLU", "Glucose", "GLUCOSE"],
    Platelets: ["PLATELET", "PLT", "Platelets", "PLATELETS"],
    WBC: ["WBC", "White Blood Cell"],
    RBC: ["RBC"],
    INR: ["INR"],
    Iron: ["FE", "Iron", "IRON"],
}

function labLookup(labs: Record<string, LabValue>, canonical: string): LabValue | undefined {
    const aliases = LAB_ALIASES[canonical]
    if (!aliases) return labs[canonical]
    for (const alias of aliases) {
        if (labs[alias]) return labs[alias]
    }
    return undefined
}

// ─── Client-side analysis (fallback when no DB analysis) ─────────────────────

function analyzeInfusion(labs: Record<string, LabValue>): InfusionResult {
    let score = 0
    const reasons: string[] = []
    const albLab = labLookup(labs, "Albumin")
    const alb = albLab?.value
    if (alb !== undefined) {
        if (alb < 2.5)       { score += 50; reasons.push(`Critically low Albumin: ${alb} g/dL`) }
        else if (alb < 3.0)  { score += 35; reasons.push(`Very low Albumin: ${alb} g/dL`) }
        else if (alb < 3.5)  { score += 15; reasons.push(`Low Albumin: ${alb} g/dL`) }
    }
    const priority = score >= 40 ? "high" : score >= 25 ? "medium" : score > 0 ? "low" : "none"
    return { priority, score, reasons, albumin: alb }
}

function analyzeTransfusion(labs: Record<string, LabValue>): TransfusionResult {
    const findings: TransfusionResult["findings"] = []
    const hgbLab = labLookup(labs, "Hemoglobin")
    const hgb = hgbLab?.value
    const hct = labLookup(labs, "Hematocrit")?.value
    if (hgb !== undefined) {
        if (hgb < 7.0)       findings.push({ test: "Hemoglobin", value: hgb, unit: "g/dL", reason: `CRITICAL — Hgb ${hgb}` })
        else if (hgb < 8.0)  findings.push({ test: "Hemoglobin", value: hgb, unit: "g/dL", reason: `URGENT — Hgb ${hgb}` })
        else if (hgb < 9.0)  findings.push({ test: "Hemoglobin", value: hgb, unit: "g/dL", reason: `LOW — Hgb ${hgb}` })
    }
    if (hct !== undefined && hct < 25.0) findings.push({ test: "Hematocrit", value: hct, unit: "%", reason: `Low Hct ${hct}%` })
    const priority = findings.some(f => f.test === "Hemoglobin" && f.value < 7) ? "critical"
        : findings.some(f => f.test === "Hemoglobin" && f.value < 8) ? "high"
        : findings.length > 0 ? "medium" : "none"
    return { priority, hemoglobin: hgb, hematocrit: hct, findings }
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium" | "low" | "normal"

const SEVERITY_BADGE: Record<Severity, { label: string; className: string }> = {
    critical: { label: "CRITICAL", className: "bg-red-600 text-white" },
    high:     { label: "HIGH",     className: "bg-red-100 text-red-800" },
    medium:   { label: "MEDIUM",   className: "bg-amber-100 text-amber-800" },
    low:      { label: "LOW",      className: "bg-blue-50 text-blue-700" },
    normal:   { label: "OK",       className: "bg-emerald-50 text-emerald-700" },
}

function dbSeverityToSeverity(s?: string | null): Severity {
    if (s === "critical") return "critical"
    if (s === "high") return "high"
    if (s === "medium") return "medium"
    if (s === "low") return "low"
    return "normal"
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDOB(dob?: string | null): string {
    if (!dob) return "—"
    const d = new Date(dob)
    if (isNaN(d.getTime())) return "—"
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function calcAge(dob?: string | null): number | null {
    if (!dob) return null
    const d = new Date(dob)
    if (isNaN(d.getTime())) return null
    return Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function indicatorValue(ind: any): number | undefined {
    if (ind == null) return undefined
    if (typeof ind === "number") return ind
    if (typeof ind === "object" && "value" in ind) return typeof ind.value === "number" ? ind.value : undefined
    return undefined
}

function formatDays(days?: number | null): string {
    if (days == null || days < 0) return "—"
    if (days === 0) return "Today"
    if (days === 1) return "1 day"
    if (days < 30) return `${days}d`
    if (days < 365) return `${Math.floor(days / 30)}mo`
    return `${(days / 365).toFixed(1)}yr`
}

// ─── Lab value pill ───────────────────────────────────────────────────────────

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

// ─── Trend chart (dynamically loaded to avoid SSR issues with recharts) ──────

const LabTrendChart = dynamic(
    () => import("@/components/charts/LabTrendChart").then(m => m.default),
    { ssr: false, loading: () => <div className="bg-slate-50/80 border border-slate-100 rounded-lg p-3 h-[120px] flex items-center justify-center text-xs text-slate-400">Loading chart...</div> }
)

// ─── Sort / filter types ──────────────────────────────────────────────────────

type FilterType = "all" | "active" | "critical" | "high" | "medium" | "low" | "infusion" | "transfusion" | "foley" | "gtube" | "mtn" | "no-labs" | "discharged"
type SortType = "urgency" | "name-az" | "name-za" | "status" | "severity" | "room-asc" | "room-desc" | "days-long" | "days-short" | "hgb-low" | "alb-low"

interface AnalyzedPatient {
    patient: PatientSummary
    inf: InfusionResult
    tran: TransfusionResult
    hasLabs: boolean
    effectiveSeverity: Severity
    urgencyScore: number
}

const SORT_OPTIONS: { value: SortType; label: string }[] = [
    { value: "urgency",    label: "Most Urgent" },
    { value: "severity",   label: "Severity" },
    { value: "status",     label: "Status" },
    { value: "room-asc",   label: "Room ↑" },
    { value: "room-desc",  label: "Room ↓" },
    { value: "days-long",  label: "Longest Stay" },
    { value: "days-short", label: "Newest Admit" },
    { value: "hgb-low",   label: "Lowest Hgb" },
    { value: "alb-low",   label: "Lowest Alb" },
    { value: "name-az",   label: "Name A→Z" },
    { value: "name-za",   label: "Name Z→A" },
]

function parseRoom(room?: string | null): number {
    if (!room) return 99999
    const n = parseInt(room.replace(/\D/g, ''), 10)
    return isNaN(n) ? 99999 : n
}

function sortPatients(list: AnalyzedPatient[], sort: SortType): AnalyzedPatient[] {
    return [...list].sort((a, b) => {
        const sevOrder: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, normal: 0 }
        switch (sort) {
            case "urgency": {
                const diff = sevOrder[b.effectiveSeverity] - sevOrder[a.effectiveSeverity]
                return diff !== 0 ? diff : b.urgencyScore - a.urgencyScore
            }
            case "severity": {
                const diff = sevOrder[b.effectiveSeverity] - sevOrder[a.effectiveSeverity]
                return diff !== 0 ? diff : a.patient.last_name.localeCompare(b.patient.last_name)
            }
            case "status": {
                const aActive = (!a.patient.patient_status || a.patient.patient_status === 'Current') ? 0 : 1
                const bActive = (!b.patient.patient_status || b.patient.patient_status === 'Current') ? 0 : 1
                return aActive !== bActive ? aActive - bActive : a.patient.last_name.localeCompare(b.patient.last_name)
            }
            case "room-asc":  return parseRoom(a.patient.room) - parseRoom(b.patient.room)
            case "room-desc": return parseRoom(b.patient.room) - parseRoom(a.patient.room)
            case "name-az":   return a.patient.last_name.localeCompare(b.patient.last_name)
            case "name-za":   return b.patient.last_name.localeCompare(a.patient.last_name)
            case "days-long": return (b.patient.days_in_facility ?? 0) - (a.patient.days_in_facility ?? 0)
            case "days-short":return (a.patient.days_in_facility ?? 999) - (b.patient.days_in_facility ?? 999)
            case "hgb-low":   return (a.tran.hemoglobin ?? 999) - (b.tran.hemoglobin ?? 999)
            case "alb-low":   return (a.inf.albumin ?? 999) - (b.inf.albumin ?? 999)
            default:          return 0
        }
    })
}

const KEY_LABS = ["Hemoglobin", "Hematocrit", "Albumin", "BUN", "Creatinine", "Sodium", "Potassium", "CO2"]
const NORMAL: Record<string, [number, number]> = {
    Hemoglobin: [11.0, 16.0], Hematocrit: [34, 45], Albumin: [3.4, 5.0],
    BUN: [7, 23], Creatinine: [0.6, 1.2], Sodium: [136, 145], Potassium: [3.5, 5.0], CO2: [23, 29],
}

// ─── Sortable column header ──────────────────────────────────────────────────

function SortTh({ label, sortAsc, sortDesc, current, onSort, align = "center", className = "" }: {
    label: string
    sortAsc: SortType
    sortDesc?: SortType
    current: SortType
    onSort: (s: SortType) => void
    align?: "left" | "center"
    className?: string
}) {
    const isActive = current === sortAsc || current === sortDesc
    const handleClick = () => {
        if (current === sortAsc && sortDesc) onSort(sortDesc)
        else if (current === sortDesc) onSort(sortAsc)
        else onSort(sortAsc)
    }
    const arrow = current === sortAsc ? "↑" : current === sortDesc ? "↓" : ""
    return (
        <th className={`text-${align} px-2 py-2.5 ${className}`}>
            <button onClick={handleClick}
                className={`inline-flex items-center gap-0.5 hover:text-teal-600 transition-colors ${isActive ? "text-teal-600" : ""}`}>
                {label}
                {arrow && <span className="text-teal-500 text-[9px]">{arrow}</span>}
                {!arrow && <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
            </button>
        </th>
    )
}

// ─── Unified analysis card (merges rule-based + AI) ─────────────────────────

const RISK_META: Record<string, { icon: React.ReactNode; label: string; keyIndicatorLabel?: string; keyIndicatorField?: string; unit?: string }> = {
    infusion:    { icon: <Droplets className="w-3.5 h-3.5 text-blue-500" />,    label: "Infusion Need",    keyIndicatorLabel: "Albumin",    keyIndicatorField: "albumin",    unit: "g/dL" },
    transfusion: { icon: <FlaskConical className="w-3.5 h-3.5 text-rose-500" />, label: "Transfusion Need", keyIndicatorLabel: "Hemoglobin", keyIndicatorField: "hemoglobin", unit: "g/dL" },
    foley_risk:  { icon: <Syringe className="w-3.5 h-3.5 text-purple-500" />,    label: "Foley Tube Risk" },
    gtube_risk:  { icon: <Utensils className="w-3.5 h-3.5 text-orange-500" />,   label: "G-Tube Risk" },
    mtn_risk:    { icon: <Apple className="w-3.5 h-3.5 text-lime-600" />,         label: "MTN / Nutrition Risk" },
}

function UnifiedRiskCard({ riskType, rule, ai }: { riskType: string; rule: DbAnalysis | null; ai: DbAnalysis | null }) {
    const meta = RISK_META[riskType]
    if (!meta) return null
    const primary = rule ?? ai
    if (!primary) return null
    const sev = dbSeverityToSeverity(primary.severity)
    if (sev === "normal" && !ai) return null

    const bg = sev === 'critical' ? 'bg-red-50 border-red-200'
        : sev === 'high' ? 'bg-red-50/50 border-red-100'
        : sev === 'medium' ? 'bg-amber-50 border-amber-200'
        : 'bg-slate-50 border-slate-100'

    const keyVal = meta.keyIndicatorField && rule ? indicatorValue(rule.indicators?.[meta.keyIndicatorField]) : undefined
    const recs = (ai?.indicators?.recommendations ?? []) as string[]
    const missed = (ai?.indicators?.missed_factors ?? []) as string[]

    return (
        <div className={`rounded-lg border p-3 ${bg}`}>
            <div className="flex items-center gap-1.5 mb-1.5">
                {meta.icon}
                <span className="text-xs font-bold text-slate-700">{meta.label}</span>
                <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded ${SEVERITY_BADGE[sev].className}`}>
                    {(primary.severity ?? 'normal').toUpperCase()}
                </span>
            </div>
            <p className="text-[10px] text-slate-600 leading-relaxed">{rule?.reasoning ?? ai?.reasoning ?? ''}</p>
            {keyVal != null && (
                <p className="text-[10px] font-semibold text-slate-500 mt-1">{meta.keyIndicatorLabel}: {keyVal} {meta.unit}</p>
            )}
            {ai && (
                <div className="mt-2 pt-2 border-t border-slate-200/60">
                    {ai.reasoning && rule && (
                        <p className="text-[10px] text-indigo-600 leading-relaxed mb-1">
                            <span className="font-semibold">AI:</span> {ai.reasoning}
                        </p>
                    )}
                    {recs.length > 0 && (
                        <div className="mb-1">
                            <p className="text-[9px] font-bold text-teal-700 mb-0.5">Recommendations</p>
                            <ul className="text-[9px] text-slate-600 space-y-0.5">
                                {recs.map((r, i) => <li key={i} className="flex gap-1"><span className="text-teal-400">&#8250;</span>{r}</li>)}
                            </ul>
                        </div>
                    )}
                    {missed.length > 0 && (
                        <div>
                            <p className="text-[9px] font-bold text-amber-600 mb-0.5">Additional Factors</p>
                            <ul className="text-[9px] text-slate-600 space-y-0.5">
                                {missed.map((m, i) => <li key={i} className="flex gap-1"><span className="text-amber-400">&#8250;</span>{m}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ─── Overview tab with unified cards + manual AI trigger ─────────────────────

function OverviewTab({ patient, dbAnalysis, onAnalysisUpdate }: {
    patient: PatientSummary
    dbAnalysis: Record<string, DbAnalysis | null>
    onAnalysisUpdate: (simplId: string, updated: Record<string, DbAnalysis | null>) => void
}) {
    const [aiLoading, setAiLoading] = useState(false)

    const riskTypes = ['infusion', 'transfusion', 'foley_risk', 'gtube_risk', 'mtn_risk'] as const
    const hasAnyRuleData = riskTypes.some(t => dbAnalysis[t])
    const hasAiData = riskTypes.some(t => dbAnalysis[`ai_${t}`])

    const triggerAI = async () => {
        setAiLoading(true)
        try {
            const res = await fetch(`/api/admin/reanalyze?simplId=${patient.simpl_id}`, {
                headers: { Authorization: `Bearer simpl-cron-s3cur3-xK9mP2026` },
            })
            const data = await res.json()
            if (data.ok && data.results) {
                const updated = { ...dbAnalysis }
                for (const r of data.results as Array<{ type: string; severity: string; score: number; reasoning: string; indicators: Record<string, unknown> }>) {
                    updated[r.type] = {
                        severity: r.severity,
                        score: r.score,
                        priority: r.severity === 'critical' || r.severity === 'high' ? 'action_needed' : r.severity === 'medium' ? 'monitor' : 'none',
                        reasoning: r.reasoning,
                        indicators: r.indicators ?? {},
                    }
                }
                onAnalysisUpdate(patient.simpl_id, updated)
            }
        } catch (err) {
            console.error('[AI trigger] failed:', err)
        } finally {
            setAiLoading(false)
        }
    }

    const visibleCards = riskTypes
        .map(t => ({ type: t, rule: dbAnalysis[t] ?? null, ai: dbAnalysis[`ai_${t}`] ?? null }))
        .filter(c => {
            if (!c.rule && !c.ai) return false
            const sev = dbSeverityToSeverity(c.rule?.severity ?? c.ai?.severity)
            return sev !== "normal"
        })

    return (
        <div className="p-4">
            {/* AI trigger button */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {hasAiData && <span className="flex items-center gap-1 text-[9px] text-teal-600 font-medium"><ShieldAlert className="w-3 h-3" />AI analysis included</span>}
                </div>
                <button onClick={triggerAI} disabled={aiLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50">
                    {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldAlert className="w-3 h-3" />}
                    {aiLoading ? "Running AI Analysis..." : hasAiData ? "Refresh AI Insights" : "Run AI Analysis"}
                </button>
            </div>

            {visibleCards.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {visibleCards.map(c => (
                        <UnifiedRiskCard key={c.type} riskType={c.type} rule={c.rule} ai={c.ai} />
                    ))}
                </div>
            ) : (
                <div className="text-center py-8 text-xs text-slate-400">
                    {hasAnyRuleData
                        ? "All risk assessments are normal for this patient."
                        : "No analysis data yet — sync pending for this patient."}
                </div>
            )}
        </div>
    )
}

// ─── Inline detail panel ─────────────────────────────────────────────────────

function InlineDetail({ patient, labs, labHistory, labHistoryLoading, openResources, onFetchResource, onCloseResource, onAnalysisUpdate, colSpan }: {
    patient: PatientSummary
    labs: Record<string, LabValue>
    labHistory: Record<string, unknown> | null
    labHistoryLoading: boolean
    openResources: Record<string, ResourceState>
    onFetchResource: (simplId: string, resource: string) => void
    onCloseResource: (resource: string) => void
    onAnalysisUpdate: (simplId: string, updated: Record<string, DbAnalysis | null>) => void
    colSpan: number
}) {
    const panelRef = useRef<HTMLTableRowElement>(null)
    const [activeTab, setActiveTab] = useState<"overview" | "labs" | "trends" | "data">("overview")

    useEffect(() => {
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }, [patient.simpl_id])

    const keyLabs = KEY_LABS.map(canonical => {
        const lab = labLookup(labs, canonical)
        if (!lab) return null
        return { canonical, lab }
    }).filter(Boolean) as Array<{ canonical: string; lab: LabValue }>

    const histMap = (labHistory ?? {}) as Record<string, Array<{ date: string; value: number; referenceRange?: string }>>
    const charts = KEY_LABS.map(canonical => {
        const aliases = LAB_ALIASES[canonical] ?? [canonical]
        const key = aliases.find(a => histMap[a] && histMap[a].length >= 2)
        if (!key) return null
        const latestLab = labLookup(labs, canonical)
        const rawHistory = histMap[key].filter(h => h.value != null && h.date)
        const sorted = [...rawHistory].sort((a, b) => a.date.localeCompare(b.date))
        return { canonical, history: sorted, refRange: rawHistory[0]?.referenceRange ?? latestLab?.referenceRange }
    }).filter(Boolean) as Array<{ canonical: string; history: Array<{ date: string; value: number }>; refRange?: string }>

    const age = calcAge(patient.date_of_birth)
    const resources = patient.resources ?? []
    const dbAnalysis = patient.db_analysis

    const tabs = [
        { id: "overview" as const, label: "Overview" },
        { id: "labs" as const, label: "Labs", count: keyLabs.length },
        { id: "trends" as const, label: "Trends", count: labHistoryLoading ? -1 : charts.length },
        ...(resources.length > 0 ? [{ id: "data" as const, label: "Raw Data", count: resources.length }] : []),
    ]

    return (
        <tr ref={panelRef} className="bg-slate-50/50">
            <td colSpan={colSpan} className="p-0">
                <div className="mx-3 my-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Header */}
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <p className="font-bold text-sm text-slate-800">{patient.last_name}, {patient.first_name}</p>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 flex-wrap">
                                {age != null && <span>{age} yrs</span>}
                                {patient.date_of_birth && <span>DOB {formatDOB(patient.date_of_birth)}</span>}
                                {patient.room && <span className="flex items-center gap-0.5"><Bed className="w-2.5 h-2.5" />Rm {patient.room}{patient.bed ? patient.bed : ''}</span>}
                                {patient.unit && <span>{patient.unit}</span>}
                                {patient.days_in_facility != null && <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{formatDays(patient.days_in_facility)} in facility</span>}
                                {patient.admit_date && <span>Admitted {new Date(patient.admit_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
                            </div>
                        </div>
                        <div className="flex items-center gap-0.5">
                            {tabs.map(t => (
                                <button key={t.id} onClick={() => setActiveTab(t.id)}
                                    className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors ${activeTab === t.id ? "bg-teal-50 text-teal-700" : "text-slate-400 hover:text-slate-600"}`}>
                                    {t.label}
                                    {'count' in t && (t.count ?? 0) > 0 && <span className="ml-1 text-[9px] bg-slate-100 text-slate-500 px-1 rounded">{t.count}</span>}
                                    {'count' in t && t.count === -1 && <Loader2 className="w-2.5 h-2.5 animate-spin inline ml-1" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="max-h-[400px] overflow-y-auto">
                        {/* Overview tab */}
                        {activeTab === "overview" && (
                            <OverviewTab patient={patient} dbAnalysis={dbAnalysis ?? {}} onAnalysisUpdate={onAnalysisUpdate} />
                        )}

                        {/* Labs tab */}
                        {activeTab === "labs" && (
                            <div className="p-3">
                                {keyLabs.length === 0
                                    ? <div className="py-6 text-center text-xs text-slate-400">No lab data available for this patient.</div>
                                    : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5">
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
                                }
                            </div>
                        )}

                        {/* Trends tab */}
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

                        {/* Raw data tab */}
                        {activeTab === "data" && resources.length > 0 && (
                            <div className="p-3">
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {resources.map(resource => {
                                        const rs = openResources[resource]
                                        return (
                                            <button key={resource} onClick={e => { e.stopPropagation(); rs ? onCloseResource(resource) : onFetchResource(patient.simpl_id, resource) }}
                                                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border transition-all ${rs ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400'}`}>
                                                {rs?.loading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : rs ? <X className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
                                                {resource}
                                            </button>
                                        )
                                    })}
                                </div>
                                {Object.entries(openResources).map(([resource, rs]) => (
                                    <div key={resource} className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-2">
                                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 bg-slate-50/80">
                                            <span className="text-[10px] font-semibold text-slate-700">{resource}</span>
                                            <button onClick={() => onCloseResource(resource)} className="p-0.5 text-slate-400 hover:text-red-600"><X className="w-3 h-3" /></button>
                                        </div>
                                        <div className="p-2 max-h-56 overflow-y-auto">
                                            {rs.loading && <div className="text-xs text-slate-400 py-2 text-center"><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Loading...</div>}
                                            {rs.error && <div className="text-xs text-red-600 bg-red-50 rounded p-2"><AlertCircle className="w-3 h-3 inline mr-1" />{rs.error}</div>}
                                            {rs.data != null && !rs.loading && <ResourceDataRenderer resource={resource} data={rs.data} />}
                                        </div>
                                    </div>
                                ))}
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
    const [lastRefreshed, setLastRefreshed] = useState<string | null>(null)
    const [dataSource, setDataSource] = useState<string>('local_cache')
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
            setLastRefreshed(data.lastRefreshed ?? null)
            setDataSource(data.data_source ?? 'local_cache')
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

    const updatePatientAnalysis = useCallback((simplId: string, updated: Record<string, DbAnalysis | null>) => {
        setPatients(prev => prev.map(p =>
            p.simpl_id === simplId ? { ...p, db_analysis: updated } : p
        ))
    }, [])

    // Determine severity — prefer DB analysis, fall back to client-side
    const analyzed: AnalyzedPatient[] = patients.map(p => {
        const labs = p.labs_latest ?? {}
        const inf = analyzeInfusion(labs)
        const tran = analyzeTransfusion(labs)
        const hasLabs = Object.keys(labs).length > 0 || !!p.db_analysis?.infusion || !!p.db_analysis?.transfusion || !!p.db_analysis?.mtn_risk

        const sevOrder: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, normal: 0 }

        // Compute effective severity from ALL analysis modules (rule-based only, not ai_ prefixed)
        let effectiveSeverity: Severity = "normal"
        if (p.db_analysis) {
            const ruleTypes = ['infusion', 'transfusion', 'foley_risk', 'gtube_risk', 'mtn_risk']
            for (const t of ruleTypes) {
                const a = p.db_analysis[t]
                if (a) {
                    const s = dbSeverityToSeverity(a.severity)
                    if (sevOrder[s] > sevOrder[effectiveSeverity]) effectiveSeverity = s
                }
            }
        }

        // Pull key indicator values for display in the table row
        if (p.db_analysis?.infusion) {
            inf.albumin = indicatorValue(p.db_analysis.infusion.indicators?.albumin)
            const s = dbSeverityToSeverity(p.db_analysis.infusion.severity)
            inf.priority = s === 'critical' || s === 'high' ? 'high' : s === 'medium' ? 'medium' : s === 'low' ? 'low' : 'none'
        }
        if (p.db_analysis?.transfusion) {
            tran.hemoglobin = indicatorValue(p.db_analysis.transfusion.indicators?.hemoglobin)
            tran.hematocrit = indicatorValue(p.db_analysis.transfusion.indicators?.hematocrit)
            const s = dbSeverityToSeverity(p.db_analysis.transfusion.severity)
            tran.priority = s === 'critical' ? 'critical' : s === 'high' ? 'high' : s === 'medium' ? 'medium' : 'none'
        }

        // Fall back to client-side analysis if no DB analysis exists
        if (!p.db_analysis || Object.keys(p.db_analysis).length === 0) {
            if (tran.priority === "critical") effectiveSeverity = "critical"
            else if (tran.priority === "high") effectiveSeverity = "high"
            else if (inf.priority === "high") effectiveSeverity = "high"
            else if (tran.priority === "medium" || inf.priority === "medium") effectiveSeverity = "medium"
            else if (inf.priority === "low") effectiveSeverity = "low"
        }

        const sevScore = { critical: 1000, high: 500, medium: 200, low: 50, normal: 0 }
        const urgencyScore = sevScore[effectiveSeverity] + (p.db_analysis?.infusion?.score ?? inf.score)

        return { patient: p, inf, tran, hasLabs, effectiveSeverity, urgencyScore }
    })

    const isActive = (p: PatientSummary) =>
        !p.patient_status || p.patient_status === 'Current'

    const hasPrediction = (p: PatientSummary, type: string, minSev = "low") => {
        const a = p.db_analysis?.[type as keyof typeof p.db_analysis]
        if (!a) return false
        const sevMap: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, normal: 0 }
        return (sevMap[a.severity] ?? 0) >= (sevMap[minSev] ?? 1)
    }

    const counts: Record<FilterType, number> = {
        all: analyzed.length,
        active: analyzed.filter(a => isActive(a.patient)).length,
        critical: analyzed.filter(a => a.effectiveSeverity === "critical" && isActive(a.patient)).length,
        high: analyzed.filter(a => a.effectiveSeverity === "high" && isActive(a.patient)).length,
        medium: analyzed.filter(a => a.effectiveSeverity === "medium" && isActive(a.patient)).length,
        low: analyzed.filter(a => a.effectiveSeverity === "low" && isActive(a.patient)).length,
        infusion: analyzed.filter(a => a.inf.priority !== "none" && isActive(a.patient)).length,
        transfusion: analyzed.filter(a => a.tran.priority !== "none" && isActive(a.patient)).length,
        foley: analyzed.filter(a => hasPrediction(a.patient, "foley_risk") && isActive(a.patient)).length,
        gtube: analyzed.filter(a => hasPrediction(a.patient, "gtube_risk") && isActive(a.patient)).length,
        mtn: analyzed.filter(a => hasPrediction(a.patient, "mtn_risk") && isActive(a.patient)).length,
        "no-labs": analyzed.filter(a => !a.hasLabs && isActive(a.patient)).length,
        discharged: analyzed.filter(a => !isActive(a.patient)).length,
    }

    const searched = searchQuery.trim()
        ? analyzed.filter(a => {
            const q = searchQuery.toLowerCase()
            return a.patient.first_name?.toLowerCase().includes(q)
                || a.patient.last_name?.toLowerCase().includes(q)
                || a.patient.room?.toLowerCase().includes(q)
                || a.patient.simpl_id.includes(q)
        })
        : analyzed

    const filtered = searched.filter(a => {
        switch (activeFilter) {
            case "active":      return isActive(a.patient)
            case "critical":    return a.effectiveSeverity === "critical" && isActive(a.patient)
            case "high":        return a.effectiveSeverity === "high" && isActive(a.patient)
            case "medium":      return a.effectiveSeverity === "medium" && isActive(a.patient)
            case "low":         return a.effectiveSeverity === "low" && isActive(a.patient)
            case "infusion":    return a.inf.priority !== "none" && isActive(a.patient)
            case "transfusion": return a.tran.priority !== "none" && isActive(a.patient)
            case "foley":       return hasPrediction(a.patient, "foley_risk") && isActive(a.patient)
            case "gtube":       return hasPrediction(a.patient, "gtube_risk") && isActive(a.patient)
            case "mtn":         return hasPrediction(a.patient, "mtn_risk") && isActive(a.patient)
            case "no-labs":     return !a.hasLabs && isActive(a.patient)
            case "discharged":  return !isActive(a.patient)
            default:            return true
        }
    })

    const sorted = sortPatients(filtered, sortBy)
    const COL_SPAN = 12

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
        { key: "all",         label: "All",         icon: <Users className="w-3 h-3" />,          color: "text-slate-600 border-slate-200 hover:bg-slate-50",    activeColor: "text-white bg-slate-700 border-slate-700" },
        { key: "active",      label: "Active",      icon: <UserCheck className="w-3 h-3" />,      color: "text-emerald-600 border-emerald-200 hover:bg-emerald-50", activeColor: "text-white bg-emerald-600 border-emerald-600" },
        { key: "critical",    label: "Critical",    icon: <AlertTriangle className="w-3 h-3" />,  color: "text-red-600 border-red-200 hover:bg-red-50",         activeColor: "text-white bg-red-600 border-red-600" },
        { key: "high",        label: "High",        icon: <TrendingDown className="w-3 h-3" />,   color: "text-red-500 border-red-200 hover:bg-red-50",         activeColor: "text-white bg-red-500 border-red-500" },
        { key: "medium",      label: "Monitor",     icon: <Eye className="w-3 h-3" />,            color: "text-amber-600 border-amber-200 hover:bg-amber-50",   activeColor: "text-white bg-amber-500 border-amber-500" },
        { key: "infusion",    label: "Infusion",    icon: <Droplets className="w-3 h-3" />,       color: "text-blue-600 border-blue-200 hover:bg-blue-50",      activeColor: "text-white bg-blue-600 border-blue-600" },
        { key: "transfusion", label: "Transfusion", icon: <FlaskConical className="w-3 h-3" />,   color: "text-rose-600 border-rose-200 hover:bg-rose-50",      activeColor: "text-white bg-rose-600 border-rose-600" },
        { key: "foley",       label: "Foley Risk",  icon: <Syringe className="w-3 h-3" />,        color: "text-purple-600 border-purple-200 hover:bg-purple-50", activeColor: "text-white bg-purple-600 border-purple-600" },
        { key: "gtube",       label: "G-Tube Risk", icon: <Utensils className="w-3 h-3" />,       color: "text-orange-600 border-orange-200 hover:bg-orange-50", activeColor: "text-white bg-orange-600 border-orange-600" },
        { key: "mtn",         label: "MTN Risk",    icon: <Apple className="w-3 h-3" />,          color: "text-lime-700 border-lime-200 hover:bg-lime-50",      activeColor: "text-white bg-lime-700 border-lime-700" },
        { key: "discharged",  label: "Discharged",  icon: <UserX className="w-3 h-3" />,          color: "text-slate-400 border-slate-200 hover:bg-slate-50",   activeColor: "text-white bg-slate-500 border-slate-500" },
    ]

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center border border-teal-200/50">
                        <Users className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-tight">{facilityName}</h1>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <span>{loading ? 'Loading...' : `${patients.length} active patients`}</span>
                            {lastRefreshed && <span>· Last sync {new Date(lastRefreshed).toLocaleString()}</span>}
                            {dataSource === 'live_db' && <span className="px-1.5 py-0.5 bg-teal-50 text-teal-600 rounded font-semibold border border-teal-100">LIVE</span>}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!loading && (
                        <div className="flex items-center gap-1.5 mr-2">
                            {counts.critical > 0 && <div className="flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-200 rounded-lg"><AlertTriangle className="w-3 h-3 text-red-600" /><span className="text-xs font-bold text-red-700">{counts.critical}</span><span className="text-[9px] text-red-500">crit</span></div>}
                            {counts.high > 0 && <div className="flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-100 rounded-lg"><span className="text-xs font-bold text-red-600">{counts.high}</span><span className="text-[9px] text-red-400">high</span></div>}
                            {counts.medium > 0 && <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg"><span className="text-xs font-bold text-amber-700">{counts.medium}</span><span className="text-[9px] text-amber-500">monitor</span></div>}
                        </div>
                    )}
                    <button onClick={loadPatients} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 hover:border-teal-400 hover:text-teal-600 text-slate-600 rounded-lg transition-colors shadow-sm disabled:opacity-50">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh
                    </button>
                </div>
            </div>

            {/* Search + Filter + Sort */}
            {!loading && patients.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input type="text" placeholder="Search name or room…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 shadow-sm" />
                        {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"><X className="w-3 h-3" /></button>}
                    </div>
                    <div className="h-5 w-px bg-slate-200" />
                    {FILTERS.map(f => (
                        <button key={f.key} onClick={() => setActiveFilter(f.key)}
                            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${activeFilter === f.key ? f.activeColor : f.color}`}>
                            {f.icon}{f.label}
                            {counts[f.key] > 0 && <span className={`ml-0.5 px-1 py-0 rounded text-[9px] font-bold ${activeFilter === f.key ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"}`}>{counts[f.key]}</span>}
                        </button>
                    ))}
                    <div className="h-5 w-px bg-slate-200" />
                    <div className="relative">
                        <button onClick={() => setShowSortMenu(v => !v)} className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors">
                            <ArrowUpDown className="w-3 h-3" />{SORT_OPTIONS.find(s => s.value === sortBy)?.label}
                            {showSortMenu ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                        </button>
                        {showSortMenu && (
                            <><div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                            <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50">
                                {SORT_OPTIONS.map(s => (
                                    <button key={s.value} onClick={() => { setSortBy(s.value); setShowSortMenu(false) }}
                                        className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-slate-50 transition-colors ${sortBy === s.value ? "font-bold text-teal-700 bg-teal-50/50" : "text-slate-600"}`}>
                                        {s.label}
                                    </button>
                                ))}
                            </div></>
                        )}
                    </div>
                    {(searchQuery || activeFilter !== "all") && <span className="text-[10px] text-slate-400">{sorted.length}/{patients.length}</span>}
                </div>
            )}

            {loading && <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading patients...</div>}
            {!loading && patients.length === 0 && <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-2"><AlertCircle className="w-6 h-6" /><p>No patients found.</p></div>}
            {!loading && patients.length > 0 && sorted.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
                    <Search className="w-5 h-5" /><p className="text-sm">No patients match your filters.</p>
                    <button onClick={() => { setSearchQuery(""); setActiveFilter("all") }} className="text-xs text-teal-600 hover:text-teal-700 font-medium">Clear filters</button>
                </div>
            )}

            {/* Patient table */}
            {!loading && sorted.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <th className="text-left pl-4 pr-1 py-2.5 w-5"></th>
                                <SortTh label="Patient" sortAsc="name-az" sortDesc="name-za" current={sortBy} onSort={setSortBy} align="left" />
                                <SortTh label="Status" sortAsc="status" current={sortBy} onSort={setSortBy} />
                                <SortTh label="Severity" sortAsc="severity" sortDesc="urgency" current={sortBy} onSort={setSortBy} />
                                <SortTh label="Room" sortAsc="room-asc" sortDesc="room-desc" current={sortBy} onSort={setSortBy} className="hidden sm:table-cell" />
                                <th className="text-center px-2 py-2.5 hidden md:table-cell">Age / DOB</th>
                                <SortTh label="Days In" sortAsc="days-short" sortDesc="days-long" current={sortBy} onSort={setSortBy} className="hidden md:table-cell" />
                                <SortTh label="Hgb" sortAsc="hgb-low" current={sortBy} onSort={setSortBy} />
                                <SortTh label="Alb" sortAsc="alb-low" current={sortBy} onSort={setSortBy} />
                                <th className="text-center px-2 py-2.5 hidden lg:table-cell">Hct</th>
                                <th className="text-left px-2 py-2.5 hidden md:table-cell">Flags</th>
                                <th className="w-6 pr-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map(({ patient, inf, tran, effectiveSeverity, hasLabs }) => {
                                const labs = patient.labs_latest ?? {}
                                const hgb = tran.hemoglobin ?? labLookup(labs, "Hemoglobin")?.value
                                const alb = inf.albumin ?? labLookup(labs, "Albumin")?.value
                                const hct = tran.hematocrit ?? labLookup(labs, "Hematocrit")?.value
                                const isExpanded = expandedId === patient.simpl_id
                                const age = calcAge(patient.date_of_birth)
                                const active = isActive(patient)

                                const rowAccent = !active ? "border-l-[3px] border-l-slate-200 opacity-60"
                                    : effectiveSeverity === "critical" ? "border-l-[3px] border-l-red-500"
                                    : effectiveSeverity === "high" ? "border-l-[3px] border-l-red-300"
                                    : effectiveSeverity === "medium" ? "border-l-[3px] border-l-amber-400"
                                    : "border-l-[3px] border-l-transparent"

                                const badge = SEVERITY_BADGE[effectiveSeverity]

                                return (
                                    <Fragment key={patient.simpl_id}>
                                        <tr className={`border-b border-slate-50 hover:bg-slate-50/60 cursor-pointer transition-colors ${rowAccent} ${isExpanded ? "bg-teal-50/40 !border-b-0" : ""} ${!active ? "bg-slate-50/30" : ""}`}
                                            onClick={() => expandPatient(patient.simpl_id)}>
                                            <td className="pl-4 pr-1 py-2.5">
                                                {active && effectiveSeverity === "critical" ? (
                                                    <span className="relative flex h-2.5 w-2.5">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                                                    </span>
                                                ) : active && effectiveSeverity === "high" ? <span className="inline-flex rounded-full h-2.5 w-2.5 bg-red-400"></span>
                                                : active && effectiveSeverity === "medium" ? <span className="inline-flex rounded-full h-2.5 w-2.5 bg-amber-400"></span>
                                                : <span className="inline-flex rounded-full h-2 w-2 bg-slate-200"></span>}
                                            </td>
                                            <td className="px-2 py-2.5">
                                                <p className={`text-sm leading-tight ${!active ? "text-slate-400 line-through" : effectiveSeverity === "critical" || effectiveSeverity === "high" ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>
                                                    {patient.last_name}, {patient.first_name}
                                                </p>
                                            </td>
                                            <td className="px-2 py-2.5 text-center">
                                                {active
                                                    ? <span className="flex items-center justify-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200"><UserCheck className="w-2.5 h-2.5" />Active</span>
                                                    : <span className="flex items-center justify-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-slate-100 text-slate-400 border border-slate-200"><UserX className="w-2.5 h-2.5" />Discharged</span>}
                                            </td>
                                            <td className="px-2 py-2.5 text-center">
                                                {active && hasLabs
                                                    ? <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${badge.className}`}>{badge.label}</span>
                                                    : active
                                                    ? <span className="px-1.5 py-0.5 text-[9px] font-bold bg-slate-100 text-slate-400 rounded">NO DATA</span>
                                                    : <span className="text-slate-300 text-[9px]">—</span>}
                                            </td>
                                            <td className="px-2 py-2.5 text-center text-xs text-slate-500 hidden sm:table-cell">
                                                {patient.room ? <span className="flex items-center justify-center gap-0.5"><Bed className="w-3 h-3 text-slate-300" />{patient.room}{patient.bed ?? ''}</span> : '—'}
                                            </td>
                                            <td className="px-2 py-2.5 text-center hidden md:table-cell">
                                                <div className={`text-xs font-semibold tabular-nums ${active ? "text-slate-600" : "text-slate-400"}`}>{age != null ? `${age}y` : '—'}</div>
                                                {patient.date_of_birth && <div className="text-[9px] text-slate-400">{formatDOB(patient.date_of_birth)}</div>}
                                            </td>
                                            <td className="px-2 py-2.5 text-center hidden md:table-cell">
                                                <div className={`text-xs font-semibold ${active ? "text-slate-600" : "text-slate-400"}`}>{formatDays(patient.days_in_facility)}</div>
                                            </td>
                                            <td className="px-2 py-2.5 text-center">{active ? <LabPill value={hgb} low={11} high={16} /> : <span className="text-slate-200 text-xs">—</span>}</td>
                                            <td className="px-2 py-2.5 text-center">{active ? <LabPill value={alb} low={3.4} high={5} /> : <span className="text-slate-200 text-xs">—</span>}</td>
                                            <td className="px-2 py-2.5 text-center hidden lg:table-cell">{active ? <LabPill value={hct} low={34} high={45} unit="%" /> : <span className="text-slate-200 text-xs">—</span>}</td>
                                            <td className="px-2 py-2.5 hidden md:table-cell">
                                                {active && <div className="flex gap-1 flex-wrap">
                                                    {tran.priority !== "none" && (
                                                        <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${tran.priority === "critical" || tran.priority === "high" ? "bg-rose-600 text-white" : "bg-rose-100 text-rose-700"}`}>
                                                            {tran.priority === "critical" ? "TRANSFUSE" : "Transfusion"}
                                                        </span>
                                                    )}
                                                    {inf.priority !== "none" && (
                                                        <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${inf.priority === "high" ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-700"}`}>
                                                            {inf.priority === "high" ? "INFUSE" : "Infusion"}
                                                        </span>
                                                    )}
                                                    {patient.db_analysis?.foley_risk && dbSeverityToSeverity(patient.db_analysis.foley_risk.severity) !== "normal" && (
                                                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-purple-100 text-purple-700">Foley</span>
                                                    )}
                                                    {patient.db_analysis?.gtube_risk && dbSeverityToSeverity(patient.db_analysis.gtube_risk.severity) !== "normal" && (
                                                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-orange-100 text-orange-700">G-Tube</span>
                                                    )}
                                                    {patient.db_analysis?.mtn_risk && dbSeverityToSeverity(patient.db_analysis.mtn_risk.severity) !== "normal" && (
                                                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-lime-100 text-lime-700">MTN</span>
                                                    )}
                                                </div>}
                                            </td>
                                            <td className="pr-3 py-2.5">{isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-teal-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}</td>
                                        </tr>
                                        {isExpanded && (
                                            <InlineDetail
                                                patient={patient}
                                                labs={patient.labs_latest ?? {}}
                                                labHistory={labHistory}
                                                labHistoryLoading={labHistoryLoading}
                                                openResources={openResources}
                                                onFetchResource={fetchResource}
                                                onCloseResource={closeResource}
                                                onAnalysisUpdate={updatePatientAnalysis}
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
