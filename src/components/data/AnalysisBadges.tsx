"use client"

import { Loader2, FlaskConical, Droplets, ClipboardList, WifiOff } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnalysisPriority = "critical" | "high" | "medium" | "low" | "none"

export interface PDPMResult {
    success?: boolean
    error?: string
    components?: {
        NTA?: { total_score?: number; group?: string }
        PT_OT?: { pt_group?: string; ot_group?: string }
        SLP?: { group?: string }
        Nursing?: { group?: string }
    }
}

export interface InfusionResult {
    success?: boolean
    error?: string
    score?: number
    priority?: string
    reasons?: string[]
}

export interface TransfusionResult {
    success?: boolean
    error?: string
    critical_findings?: Array<{
        priority?: string
        reason?: string
        action?: string
        metric?: string
        value?: number
        unit?: string
    }>
}

export interface PatientAnalysis {
    simplId: string
    status: "idle" | "running" | "done" | "error" | "offline"
    pdpm?: PDPMResult
    infusion?: InfusionResult
    transfusion?: TransfusionResult
    dataSource?: "live" | "default"
    timestamp?: string
}

// ─── Priority helpers ─────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<AnalysisPriority, string> = {
    critical: "bg-red-600 text-white",
    high:     "bg-red-100 text-red-700 border border-red-200",
    medium:   "bg-amber-100 text-amber-700 border border-amber-200",
    low:      "bg-slate-100 text-slate-400",
    none:     "bg-slate-100 text-slate-400",
}

function priorityFromString(s: string | undefined): AnalysisPriority {
    const lower = (s ?? "").toLowerCase()
    if (lower === "critical") return "critical"
    if (lower === "high") return "high"
    if (lower === "medium") return "medium"
    return "low"
}

// ─── Individual badge ─────────────────────────────────────────────────────────

function Badge({
    icon, label, priority, tooltip
}: {
    icon: React.ReactNode
    label: string
    priority: AnalysisPriority
    tooltip?: string
}) {
    return (
        <div
            className={`group relative flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${PRIORITY_STYLES[priority]}`}
            title={tooltip}
        >
            <span className="flex-shrink-0">{icon}</span>
            <span className="whitespace-nowrap">{label}</span>
            {tooltip && (
                <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block w-56 bg-slate-900 text-white text-[11px] rounded-lg px-3 py-2 leading-snug z-50 shadow-xl">
                    {tooltip}
                </div>
            )}
        </div>
    )
}

// ─── PDPM Badge ───────────────────────────────────────────────────────────────

function PDPMBadge({ result }: { result: PDPMResult }) {
    if (result.error === "unavailable") {
        return (
            <Badge
                icon={<ClipboardList className="w-3 h-3" />}
                label="PDPM: Offline"
                priority="none"
                tooltip="Python analysis backend not reachable"
            />
        )
    }

    const nta = result.components?.NTA?.total_score ?? 0
    const nursing = result.components?.Nursing?.group ?? "—"
    const pt = result.components?.PT_OT?.pt_group ?? "—"

    const priority: AnalysisPriority = nta >= 10 ? "high" : nta >= 5 ? "medium" : "low"
    const label = `PDPM: ${nta}pts · ${nursing}`
    const tooltip = `NTA: ${nta} pts | Nursing: ${nursing} | PT: ${pt} | OT: ${result.components?.PT_OT?.ot_group ?? "—"} | SLP: ${result.components?.SLP?.group ?? "—"}`

    return (
        <Badge
            icon={<ClipboardList className="w-3 h-3" />}
            label={label}
            priority={priority}
            tooltip={tooltip}
        />
    )
}

// ─── Infusion Badge ───────────────────────────────────────────────────────────

function InfusionBadge({ result }: { result: InfusionResult }) {
    if (result.error === "unavailable") {
        return (
            <Badge
                icon={<Droplets className="w-3 h-3" />}
                label="Infusion: Offline"
                priority="none"
            />
        )
    }

    const priority = priorityFromString(result.priority)
    const reasons = result.reasons ?? []
    const topReason = reasons[0] ?? "No significant indicators"
    const label = priority === "low"
        ? "Infusion: Low"
        : `Infusion: ${result.priority} ↑`

    return (
        <Badge
            icon={<Droplets className="w-3 h-3" />}
            label={label}
            priority={priority}
            tooltip={`Score: ${result.score ?? 0}/100 · ${reasons.slice(0, 3).join(" · ") || topReason}`}
        />
    )
}

// ─── Transfusion Badge ────────────────────────────────────────────────────────

function TransfusionBadge({ result }: { result: TransfusionResult }) {
    if (result.error === "unavailable") {
        return (
            <Badge
                icon={<FlaskConical className="w-3 h-3" />}
                label="Transfusion: Offline"
                priority="none"
            />
        )
    }

    const findings = result.critical_findings ?? []

    if (findings.length === 0) {
        return (
            <Badge
                icon={<FlaskConical className="w-3 h-3" />}
                label="Transfusion: Low"
                priority="low"
                tooltip="No critical lab findings"
            />
        )
    }

    const top = findings[0]
    const priority = priorityFromString(top.priority)
    const label = `Transfusion: ${top.priority}${findings.length > 1 ? ` +${findings.length - 1}` : ""}`

    return (
        <Badge
            icon={<FlaskConical className="w-3 h-3" />}
            label={label}
            priority={priority}
            tooltip={findings.map(f => f.reason ?? f.action ?? "").join(" · ")}
        />
    )
}

// ─── Skeleton / loading state ─────────────────────────────────────────────────

function LoadingBadge({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-400 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{label}</span>
        </div>
    )
}

// ─── Offline badge ────────────────────────────────────────────────────────────

function OfflineBadge() {
    return (
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-400" title="Analysis backend offline">
            <WifiOff className="w-3 h-3" />
            <span>Analysis offline</span>
        </div>
    )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function AnalysisBadges({ analysis }: { analysis: PatientAnalysis | undefined }) {
    if (!analysis || analysis.status === "idle") {
        return (
            <div className="flex items-center gap-1.5 opacity-40 text-[11px] text-slate-400 italic">
                Analysis pending...
            </div>
        )
    }

    if (analysis.status === "running") {
        return (
            <div className="flex items-center gap-1.5 flex-wrap">
                <LoadingBadge label="PDPM" />
                <LoadingBadge label="Infusion" />
                <LoadingBadge label="Transfusion" />
            </div>
        )
    }

    if (analysis.status === "offline") {
        return <OfflineBadge />
    }

    if (analysis.status === "error") {
        return (
            <div className="text-[11px] text-red-500">Analysis failed</div>
        )
    }

    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            {analysis.pdpm && <PDPMBadge result={analysis.pdpm} />}
            {analysis.infusion && <InfusionBadge result={analysis.infusion} />}
            {analysis.transfusion && <TransfusionBadge result={analysis.transfusion} />}
            {analysis.dataSource === "default" && (
                <span className="text-[10px] text-slate-400 italic" title="No lab data available — results based on defaults">
                    (default values)
                </span>
            )}
        </div>
    )
}
