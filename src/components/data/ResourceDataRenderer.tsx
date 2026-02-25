"use client"

import { WifiOff, FlaskConical, Activity, FileText, Pill, ClipboardList, AlertTriangle } from "lucide-react"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(raw: string | undefined): string {
    if (!raw) return "—"
    try {
        return new Date(raw).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
            hour: "numeric", minute: "2-digit"
        })
    } catch { return raw }
}

function statusBadge(status: string | undefined) {
    if (!status) return null
    const s = status.toLowerCase()
    const map: Record<string, string> = {
        final: "bg-green-100 text-green-700",
        preliminary: "bg-yellow-100 text-yellow-700",
        amended: "bg-blue-100 text-blue-700",
        cancelled: "bg-slate-100 text-slate-500",
        "entered-in-error": "bg-red-100 text-red-600",
        active: "bg-green-100 text-green-700",
        completed: "bg-teal-100 text-teal-700",
        stopped: "bg-slate-100 text-slate-500",
        unknown: "bg-slate-100 text-slate-400",
    }
    const cls = map[s] ?? "bg-slate-100 text-slate-500"
    return (
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${cls}`}>
            {status}
        </span>
    )
}

function interpretationBadge(interp: string | undefined) {
    if (!interp) return null
    const map: Record<string, { cls: string; label: string }> = {
        H: { cls: "bg-red-100 text-red-700", label: "High" },
        HH: { cls: "bg-red-200 text-red-800", label: "Critical High" },
        L: { cls: "bg-blue-100 text-blue-700", label: "Low" },
        LL: { cls: "bg-blue-200 text-blue-800", label: "Critical Low" },
        N: { cls: "bg-green-100 text-green-700", label: "Normal" },
        A: { cls: "bg-orange-100 text-orange-700", label: "Abnormal" },
    }
    const i = map[interp] ?? { cls: "bg-slate-100 text-slate-500", label: interp }
    return (
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${i.cls}`}>
            {i.label}
        </span>
    )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
    if (!value) return null
    return (
        <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
            <p className="text-sm text-slate-700">{value}</p>
        </div>
    )
}

// ─── DIAGNOSTICREPORTS renderer ───────────────────────────────────────────────

interface TestResult {
    observationName?: string
    valueQuantity?: { value?: string | number; unitText?: string }
    referenceRange?: string
    interpretation?: string
}
interface TestSet {
    panelName?: string | null
    results?: TestResult[]
}

function DiagnosticReportCard({ report, idx }: { report: Record<string, unknown>; idx: number }) {
    // PCC native: reportName, reportStatus, category (string[]), testSet
    const pccName = report.reportName as string | undefined
    const code = (report.code as Record<string, unknown>)
    const codeName = pccName
        ?? (typeof code?.text === "string" ? code.text
            : typeof code?.coding === "object" ? (code.coding as Array<{ display?: string }>)?.[0]?.display
            : undefined)
    const presentedText = (report.presentedForm as Array<{ data?: string; contentType?: string }>)?.[0]?.data

    const pccStatus = (report.reportStatus ?? report.status) as string | undefined
    const pccCategory = Array.isArray(report.category)
        ? (report.category as (string | { text?: string })[]).map(c => typeof c === "string" ? c : c?.text).filter(Boolean).join(", ")
        : (report.category as { text?: string })?.text
    const testSets = report.testSet as TestSet[] | undefined
    const practitioner = report.orderingPractitioner as string | undefined
    const performer = (report.performer as Array<{ display?: string }>)?.[0]?.display

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold text-slate-800 leading-tight">
                        {codeName ?? `Lab Report #${idx + 1}`}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {statusBadge(pccStatus)}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <Field label="Date" value={formatDate(report.effectiveDateTime as string)} />
                {pccCategory && <Field label="Category" value={pccCategory} />}
                {practitioner && <Field label="Ordering" value={practitioner} />}
                {performer && <Field label="Performer" value={performer} />}
                {typeof report.reportingLaboratory === "string" && <Field label="Lab" value={report.reportingLaboratory} />}
            </div>

            {/* PCC testSet results */}
            {testSets && testSets.length > 0 && testSets.some(ts => ts.results && ts.results.length > 0) && (
                <div className="border-t border-slate-100 pt-3">
                    {testSets.map((ts, ti) => (
                        <div key={ti} className="mb-3 last:mb-0">
                            {ts.panelName && <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{ts.panelName}</p>}
                            <table className="w-full text-xs">
                                <thead><tr className="text-[10px] text-slate-400 uppercase">
                                    <th className="text-left pb-1 font-semibold">Test</th>
                                    <th className="text-right pb-1 font-semibold">Value</th>
                                    <th className="text-right pb-1 font-semibold">Ref</th>
                                </tr></thead>
                                <tbody>
                                    {ts.results?.map((r, ri) => {
                                        const val = String(r.valueQuantity?.value ?? '')
                                        const numVal = parseFloat(val)
                                        const ref = r.referenceRange ?? ''
                                        let abnormal = false
                                        if (!isNaN(numVal) && ref) {
                                            const m = ref.match(/([\d.]+)\s*[-–]\s*([\d.]+)/)
                                            if (m) abnormal = numVal < parseFloat(m[1]) || numVal > parseFloat(m[2])
                                        }
                                        return (
                                            <tr key={ri} className={`border-t border-slate-50 ${abnormal ? 'bg-red-50/50' : ''}`}>
                                                <td className="py-1 text-slate-700">{r.observationName}</td>
                                                <td className={`py-1 text-right font-medium ${abnormal ? 'text-red-600' : 'text-slate-800'}`}>
                                                    {val} {r.valueQuantity?.unitText && <span className="text-slate-400 font-normal">{r.valueQuantity.unitText}</span>}
                                                </td>
                                                <td className="py-1 text-right text-slate-400">{ref}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            )}

            {typeof report.conclusion === "string" && report.conclusion && (
                <div className="border-t border-slate-100 pt-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Conclusion</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{report.conclusion as string}</p>
                </div>
            )}

            {presentedText && (
                <div className="border-t border-slate-100 pt-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Report Content</p>
                    <pre className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                        {atob(presentedText)}
                    </pre>
                </div>
            )}
        </div>
    )
}

// ─── OBSERVATIONS renderer ────────────────────────────────────────────────────

function ObservationCard({ obs }: { obs: Record<string, unknown> }) {
    // Support FHIR (code.text), PCC native (observationName), and PCC direct (type)
    const code = obs.code as Record<string, unknown> | undefined
    const name = (obs.observationName as string)
        ?? (obs.type as string)
        ?? (typeof code?.text === "string" ? code.text
            : (code?.coding as Array<{ display?: string }>)?.[0]?.display
            ?? "Observation")

    // PCC direct: value is top-level number; FHIR: valueQuantity.value
    const qty = obs.valueQuantity as Record<string, unknown> | undefined
    const value = qty?.value ?? obs.value
    const unitCode = obs.unitCode as { code?: string } | undefined
    const unit = (qty?.unitText ?? qty?.unit ?? unitCode?.code) as string | undefined

    const interp = (obs.interpretation as Array<{ coding?: Array<{ code?: string }> }>)?.[0]
        ?.coding?.[0]?.code

    const pccRef = obs.referenceRange
    const refRange = (Array.isArray(pccRef) ? pccRef[0] : null) as {
        low?: { value?: number; unit?: string }
        high?: { value?: number; unit?: string }
        text?: string
    } | null
    const refText = (typeof pccRef === "string" ? pccRef : null)
        ?? refRange?.text
        ?? (refRange?.low?.value !== undefined && refRange?.high?.value !== undefined
            ? `${refRange.low.value}–${refRange.high.value} ${refRange.high.unit ?? ""}`
            : undefined)

    const dateStr = (obs.effectiveDateTime ?? obs.recordedDate) as string | undefined
    const method = obs.method as string | undefined
    const recordedBy = obs.recordedBy as string | undefined

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-teal-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-slate-800">{name}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {interpretationBadge(interp)}
                    {statusBadge((obs.observationStatus ?? obs.status) as string)}
                </div>
            </div>

            <div className="flex items-end gap-2 mb-3">
                {value !== undefined && value !== null ? (
                    <>
                        <span className="text-3xl font-bold text-slate-900 leading-none">{String(value)}</span>
                        {unit && <span className="text-sm text-slate-500 mb-0.5">{unit}</span>}
                    </>
                ) : (obs.valueString as string) ? (
                    <span className="text-lg font-semibold text-slate-700">{obs.valueString as string}</span>
                ) : (obs.valueCodeableConcept as Record<string, unknown>)?.text ? (
                    <span className="text-lg font-semibold text-slate-700">
                        {(obs.valueCodeableConcept as Record<string, string>).text}
                    </span>
                ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
                {refText && (
                    <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Reference</p>
                        <p className="text-slate-600">{refText}</p>
                    </div>
                )}
                <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Date</p>
                    <p className="text-slate-600">{formatDate(dateStr)}</p>
                </div>
                {method && <Field label="Method" value={method} />}
                {recordedBy && <Field label="Recorded By" value={recordedBy} />}
                {obs.observationId != null && (
                    <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">ID</p>
                        <p className="text-slate-500 font-mono">{String(obs.observationId)}</p>
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── MEDICATIONS renderer ─────────────────────────────────────────────────────

function MedicationCard({ med }: { med: Record<string, unknown> }) {
    const drug = (med.medicationCodeableConcept as Record<string, unknown>)
    const name = (drug?.text as string)
        ?? (drug?.coding as Array<{ display?: string }>)?.[0]?.display
        ?? "Medication"

    const dosage = (med.dosageInstruction as Array<Record<string, unknown>>)?.[0]
    const dose = (dosage?.doseAndRate as Array<Record<string, unknown>>)?.[0]
    const doseQty = dose?.doseQuantity as Record<string, unknown> | undefined

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                    <Pill className="w-4 h-4 text-purple-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-slate-800">{name}</span>
                </div>
                {statusBadge(med.status as string)}
            </div>
            <div className="grid grid-cols-2 gap-2">
                <Field label="Start Date" value={formatDate((med.effectivePeriod as Record<string, string>)?.start)} />
                <Field label="End Date" value={formatDate((med.effectivePeriod as Record<string, string>)?.end)} />
                {doseQty && (
                    <Field label="Dose" value={`${doseQty.value} ${doseQty.unit ?? ""}`} />
                )}
                {dosage?.route != null && (
                    <Field label="Route" value={(dosage.route as Record<string, string>)?.text} />
                )}
                {dosage?.text != null && (
                    <Field label="Instructions" value={dosage.text as string} />
                )}
            </div>
        </div>
    )
}

// ─── Generic card (for unknown resource types) ────────────────────────────────

function GenericCard({ item, idx }: { item: Record<string, unknown>; idx: number }) {
    const topFields = Object.entries(item).filter(([, v]) =>
        typeof v === "string" || typeof v === "number" || typeof v === "boolean"
    ).slice(0, 8)

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-600">Record #{idx + 1}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {topFields.map(([key, val]) => (
                    <Field key={key} label={key} value={String(val)} />
                ))}
            </div>
        </div>
    )
}

// ─── Malformed / local cache unavailable state ────────────────────────────────

function LocalCacheUnavailable({ resource }: { resource: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-10 px-6 text-center space-y-3 bg-amber-50/60 border border-amber-200 rounded-xl">
            <WifiOff className="w-8 h-8 text-amber-400" />
            <div>
                <p className="text-sm font-semibold text-amber-800">Local cache unavailable for {resource}</p>
                <p className="text-xs text-amber-600 mt-1 leading-relaxed">
                    The locally extracted data was corrupted during CSV parsing. This will resolve automatically once the AWS endpoint is connected tonight.
                </p>
            </div>
        </div>
    )
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface Props {
    resource: string
    data: unknown
}

function normalizeToArray(data: unknown): Record<string, unknown>[] | null {
    if (Array.isArray(data)) {
        // Filter out string items (malformed local cache)
        const objects = data.filter(d => d && typeof d === "object") as Record<string, unknown>[]
        if (objects.length === 0) return null
        return objects
    }
    if (data && typeof data === "object") return [data as Record<string, unknown>]
    return null
}

function isDataMalformed(data: unknown): boolean {
    if (Array.isArray(data)) {
        return data.length > 0 && data.every(d => typeof d === "string")
    }
    return false
}

const RESOURCE_ICONS: Record<string, React.ReactNode> = {
    DIAGNOSTICREPORTS: <FlaskConical className="w-4 h-4 text-indigo-500" />,
    OBSERVATIONS: <Activity className="w-4 h-4 text-teal-500" />,
    MEDICATIONS: <Pill className="w-4 h-4 text-purple-500" />,
    ASSESSMENTS: <ClipboardList className="w-4 h-4 text-orange-500" />,
}

export function ResourceDataRenderer({ resource, data }: Props) {
    if (isDataMalformed(data)) {
        return <LocalCacheUnavailable resource={resource} />
    }

    const items = normalizeToArray(data)

    if (!items || items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                <AlertTriangle className="w-6 h-6 text-slate-300" />
                <p className="text-sm text-slate-400">No records found for {resource}</p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1">
                {RESOURCE_ICONS[resource] ?? <FileText className="w-4 h-4 text-slate-400" />}
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {items.length} record{items.length !== 1 ? "s" : ""}
                </span>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {items.map((item, idx) => {
                    if (resource === "DIAGNOSTICREPORTS") {
                        return <DiagnosticReportCard key={idx} report={item} idx={idx} />
                    }
                    if (resource === "OBSERVATIONS") {
                        return <ObservationCard key={idx} obs={item} />
                    }
                    if (resource === "MEDICATIONS" || resource === "MEDICATIONREQUESTS") {
                        return <MedicationCard key={idx} med={item} />
                    }
                    return <GenericCard key={idx} item={item} idx={idx} />
                })}
            </div>
        </div>
    )
}
