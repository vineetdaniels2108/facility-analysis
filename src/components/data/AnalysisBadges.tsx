"use client"

import { Loader2, FlaskConical, Droplets, ClipboardList, WifiOff, AlertTriangle } from "lucide-react"

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

// ─── Priority config ──────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<AnalysisPriority, { badge: string; dot: string; label: string }> = {
    critical: {
        badge: "bg-red-600 text-white shadow-sm shadow-red-200",
        dot:   "bg-red-500",
        label: "Critical",
    },
    high: {
        badge: "bg-red-50 text-red-700 border border-red-200 ring-1 ring-red-100",
        dot:   "bg-red-400",
        label: "High",
    },
    medium: {
        badge: "bg-amber-50 text-amber-800 border border-amber-200 ring-1 ring-amber-100",
        dot:   "bg-amber-400",
        label: "Medium",
    },
    low: {
        badge: "bg-emerald-50 text-emerald-700 border border-emerald-200",
        dot:   "bg-emerald-400",
        label: "Low",
    },
    none: {
        badge: "bg-slate-100 text-slate-500 border border-slate-200",
        dot:   "bg-slate-300",
        label: "—",
    },
}

function priorityFromString(s: string | undefined): AnalysisPriority {
    const lower = (s ?? "").toLowerCase()
    if (lower === "critical") return "critical"
    if (lower === "high")     return "high"
    if (lower === "medium")   return "medium"
    if (lower === "low")      return "low"
    return "none"
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tooltip({ text }: { text: string }) {
    return (
        <div className="
            pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2
            w-64 bg-slate-900 text-white text-[11px] leading-relaxed
            rounded-xl px-3 py-2.5 shadow-2xl z-[9999]
            opacity-0 group-hover:opacity-100
            transition-opacity duration-150
            whitespace-normal
        ">
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
    )
}

// ─── Single badge ─────────────────────────────────────────────────────────────

function Badge({
    icon, label, priority, tooltip, suffix
}: {
    icon: React.ReactNode
    label: string
    priority: AnalysisPriority
    tooltip?: string
    suffix?: string
}) {
    const cfg = PRIORITY_CONFIG[priority]
    return (
        <div className={`group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-default select-none transition-all ${cfg.badge}`}>
            <span className="flex-shrink-0 opacity-80">{icon}</span>
            <span className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                {label}
                {suffix && <span className="opacity-60 font-normal ml-0.5">{suffix}</span>}
            </span>
            {tooltip && <Tooltip text={tooltip} />}
        </div>
    )
}

// ─── PDPM Badge ───────────────────────────────────────────────────────────────

function PDPMBadge({ result, noData }: { result: PDPMResult; noData: boolean }) {
    if (result.error === "unavailable") {
        return (
            <Badge
                icon={<ClipboardList className="w-3 h-3" />}
                label="PDPM"
                suffix="offline"
                priority="none"
                tooltip="Analysis backend not reachable"
            />
        )
    }

    if (noData) {
        return (
            <Badge
                icon={<ClipboardList className="w-3 h-3" />}
                label="PDPM"
                suffix="no labs"
                priority="none"
                tooltip="No structured lab data found in local records. Will update with live AWS data."
            />
        )
    }

    const nta     = result.components?.NTA?.total_score ?? 0
    const nursing = result.components?.Nursing?.group ?? "—"
    const pt      = result.components?.PT_OT?.pt_group ?? "—"
    const ot      = result.components?.PT_OT?.ot_group ?? "—"
    const slp     = result.components?.SLP?.group ?? "—"
    const priority: AnalysisPriority = nta >= 10 ? "high" : nta >= 5 ? "medium" : "low"

    return (
        <Badge
            icon={<ClipboardList className="w-3 h-3" />}
            label={`PDPM ${nta}pts`}
            suffix={nursing}
            priority={priority}
            tooltip={`NTA Score: ${nta} pts · Nursing: ${nursing} · PT: ${pt} · OT: ${ot} · SLP: ${slp}`}
        />
    )
}

// ─── Infusion Badge ───────────────────────────────────────────────────────────

function InfusionBadge({ result, noData }: { result: InfusionResult; noData: boolean }) {
    if (result.error === "unavailable") {
        return (
            <Badge
                icon={<Droplets className="w-3 h-3" />}
                label="Infusion"
                suffix="offline"
                priority="none"
            />
        )
    }

    if (noData) {
        return (
            <Badge
                icon={<Droplets className="w-3 h-3" />}
                label="Infusion"
                suffix="no labs"
                priority="none"
                tooltip="No lab values available to assess infusion candidacy."
            />
        )
    }

    const priority = priorityFromString(result.priority)
    const reasons  = result.reasons ?? []
    const score    = result.score ?? 0

    return (
        <Badge
            icon={<Droplets className="w-3 h-3" />}
            label="Infusion"
            suffix={result.priority ?? "Low"}
            priority={priority}
            tooltip={`Score: ${score}/100 · ${reasons.slice(0, 3).join(" · ") || "No significant indicators"}`}
        />
    )
}

// ─── Transfusion Badge ────────────────────────────────────────────────────────

function TransfusionBadge({ result, noData }: { result: TransfusionResult; noData: boolean }) {
    if (result.error === "unavailable") {
        return (
            <Badge
                icon={<FlaskConical className="w-3 h-3" />}
                label="Transfusion"
                suffix="offline"
                priority="none"
            />
        )
    }

    if (noData) {
        return (
            <Badge
                icon={<FlaskConical className="w-3 h-3" />}
                label="Transfusion"
                suffix="no labs"
                priority="none"
                tooltip="No Hemoglobin / Hematocrit / Ferritin values found in local records."
            />
        )
    }

    const findings = result.critical_findings ?? []

    if (findings.length === 0) {
        return (
            <Badge
                icon={<FlaskConical className="w-3 h-3" />}
                label="Transfusion"
                suffix="Low"
                priority="low"
                tooltip="No critical lab findings"
            />
        )
    }

    const top      = findings[0]
    const priority = priorityFromString(top.priority)
    const extra    = findings.length > 1 ? ` +${findings.length - 1} more` : ""

    return (
        <Badge
            icon={<FlaskConical className="w-3 h-3" />}
            label="Transfusion"
            suffix={`${top.priority}${extra}`}
            priority={priority}
            tooltip={findings.map(f => f.reason ?? f.action ?? "").filter(Boolean).join(" · ")}
        />
    )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingBadge({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-400 border border-slate-200 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{label}...</span>
        </div>
    )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function AnalysisBadges({ analysis }: { analysis: PatientAnalysis | undefined }) {
    if (!analysis || analysis.status === "idle") {
        return (
            <div className="text-[11px] text-slate-400 italic">
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
        return (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200" title="Analysis backend offline">
                <WifiOff className="w-3 h-3" />
                <span>Analysis offline</span>
            </div>
        )
    }

    if (analysis.status === "error") {
        return (
            <div className="flex items-center gap-1.5 text-[11px] text-red-500">
                <AlertTriangle className="w-3 h-3" />
                Analysis failed
            </div>
        )
    }

    const noData = analysis.dataSource === "default"

    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            {analysis.pdpm       && <PDPMBadge       result={analysis.pdpm}       noData={noData} />}
            {analysis.infusion   && <InfusionBadge   result={analysis.infusion}   noData={noData} />}
            {analysis.transfusion && <TransfusionBadge result={analysis.transfusion} noData={noData} />}
        </div>
    )
}
