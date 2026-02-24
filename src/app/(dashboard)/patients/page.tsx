"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
    Users, ChevronRight, ChevronDown, Loader2, RefreshCw,
    FileJson, X, Building2, AlertCircle, Clock
} from "lucide-react"
import { ResourceDataRenderer } from "@/components/data/ResourceDataRenderer"
import { AnalysisBadges, type PatientAnalysis, type AnalysisPriority } from "@/components/data/AnalysisBadges"
import { PDPMReportCard } from "@/components/data/PDPMReportCard"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientSummary {
    simpl_id: string
    first_name: string
    last_name: string
    facility: string
    resources: string[]
}

interface ResourceState {
    loading: boolean
    data: unknown
    error: string | null
    lastFetched: Date | null
}

interface PatientState {
    expanded: boolean
    refreshing: boolean
    resources: Record<string, ResourceState>
}

// ─── Priority sorting ──────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<AnalysisPriority, number> = {
    critical: 0, high: 1, medium: 2, low: 3, none: 4
}

function getPatientPriority(analysis: PatientAnalysis | undefined): number {
    if (!analysis || analysis.status !== "done") return 99
    const infP = (analysis.infusion?.priority ?? "low").toLowerCase() as AnalysisPriority
    const tranFindings = analysis.transfusion?.critical_findings ?? []
    const tranP = tranFindings.length > 0
        ? (tranFindings[0].priority ?? "low").toLowerCase() as AnalysisPriority
        : "none" as AnalysisPriority
    const nta = analysis.pdpm?.components?.NTA?.total_score ?? 0
    const pdpmP: AnalysisPriority = nta >= 10 ? "high" : nta >= 5 ? "medium" : "low"
    return Math.min(PRIORITY_ORDER[infP], PRIORITY_ORDER[tranP], PRIORITY_ORDER[pdpmP])
}

// ─── Main view ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes
const ANALYSIS_BATCH = 5               // patients analyzed concurrently

function PatientsView() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const facilityName = searchParams.get('facility') ?? ''

    const [patients, setPatients] = useState<PatientSummary[]>([])
    const [loadingPatients, setLoadingPatients] = useState(true)
    const [patientStates, setPatientStates] = useState<Record<string, PatientState>>({})
    const [analyses, setAnalyses] = useState<Record<string, PatientAnalysis>>({})
    const [isSyncing, setIsSyncing] = useState(false)
    const [lastSynced, setLastSynced] = useState<Date | null>(null)
    const [globalRefreshing, setGlobalRefreshing] = useState(false)
    const [pdpmModal, setPdpmModal] = useState<{ patient: PatientSummary; analysis: PatientAnalysis } | null>(null)

    const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

    // ── Load patients ──────────────────────────────────────────────────────────

    const loadPatients = useCallback(async (facility: string) => {
        setLoadingPatients(true)
        setPatientStates({})
        setAnalyses({})
        try {
            const url = facility
                ? `/api/patients?facility=${encodeURIComponent(facility)}`
                : '/api/patients'
            const res = await fetch(url)
            const data = await res.json()
            setPatients(data.patients ?? [])
            return data.patients as PatientSummary[]
        } catch {
            setPatients([])
            return []
        } finally {
            setLoadingPatients(false)
        }
    }, [])

    // ── Run analysis for one patient ───────────────────────────────────────────

    const analyzePatient = useCallback(async (patient: PatientSummary) => {
        setAnalyses(prev => ({
            ...prev,
            [patient.simpl_id]: { simplId: patient.simpl_id, status: "running" }
        }))

        try {
            const res = await fetch('/api/analyze/patient', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    simplId: patient.simpl_id,
                    patient_name: `${patient.first_name} ${patient.last_name}`,
                    facility: patient.facility,
                    resources: patient.resources,
                }),
            })

            if (!res.ok) throw new Error(`HTTP ${res.status}`)

            const result = await res.json()
            setAnalyses(prev => ({
                ...prev,
                [patient.simpl_id]: {
                    simplId: patient.simpl_id,
                    status: "done",
                    pdpm: result.pdpm,
                    infusion: result.infusion,
                    transfusion: result.transfusion,
                    dataSource: result.dataSource,
                    timestamp: result.timestamp,
                }
            }))
        } catch (err) {
            const msg = err instanceof Error ? err.message : ""
            const isOffline = msg.includes("fetch failed") || msg.includes("ECONNREFUSED")
            setAnalyses(prev => ({
                ...prev,
                [patient.simpl_id]: {
                    simplId: patient.simpl_id,
                    status: isOffline ? "offline" : "error",
                }
            }))
        }
    }, [])

    // ── Run analysis for all patients in batches ───────────────────────────────

    const runAnalysisForAll = useCallback(async (pts: PatientSummary[]) => {
        if (pts.length === 0) return
        setIsSyncing(true)
        for (let i = 0; i < pts.length; i += ANALYSIS_BATCH) {
            const batch = pts.slice(i, i + ANALYSIS_BATCH)
            await Promise.all(batch.map(analyzePatient))
        }
        setIsSyncing(false)
        setLastSynced(new Date())
    }, [analyzePatient])

    // ── Load + analyze on facility change ──────────────────────────────────────

    useEffect(() => {
        if (!facilityName) return
        loadPatients(facilityName).then(pts => runAnalysisForAll(pts))
    }, [facilityName, loadPatients, runAnalysisForAll])

    // ── Polling every 5 min ────────────────────────────────────────────────────

    useEffect(() => {
        if (!facilityName) return
        pollTimer.current = setInterval(async () => {
            const pts = await loadPatients(facilityName)
            runAnalysisForAll(pts)
        }, POLL_INTERVAL_MS)
        return () => { if (pollTimer.current) clearInterval(pollTimer.current) }
    }, [facilityName, loadPatients, runAnalysisForAll])

    // ── Manual refresh ─────────────────────────────────────────────────────────

    const handleRefresh = useCallback(async () => {
        setGlobalRefreshing(true)
        const pts = await loadPatients(facilityName)
        await runAnalysisForAll(pts)
        setGlobalRefreshing(false)
    }, [facilityName, loadPatients, runAnalysisForAll])

    // ── Sorted patient list (critical first) ───────────────────────────────────

    const sortedPatients = [...patients].sort((a, b) =>
        getPatientPriority(analyses[a.simpl_id]) - getPatientPriority(analyses[b.simpl_id])
    )

    // ── PCC Resource loading ───────────────────────────────────────────────────

    const togglePatient = useCallback((simplId: string) => {
        setPatientStates(prev => ({
            ...prev,
            [simplId]: {
                ...prev[simplId],
                expanded: !prev[simplId]?.expanded,
                refreshing: false,
                resources: prev[simplId]?.resources ?? {},
            }
        }))
    }, [])

    const fetchResource = useCallback(async (simplId: string, resource: string) => {
        setPatientStates(prev => ({
            ...prev,
            [simplId]: {
                ...prev[simplId],
                resources: {
                    ...prev[simplId]?.resources,
                    [resource]: { loading: true, data: null, error: null, lastFetched: null }
                }
            }
        }))

        try {
            const res = await fetch(`/api/v1/pcc/${simplId}/data/${resource}`)
            const data = await res.json()
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
            setPatientStates(prev => ({
                ...prev,
                [simplId]: {
                    ...prev[simplId],
                    resources: { ...prev[simplId]?.resources, [resource]: { loading: false, data, error: null, lastFetched: new Date() } }
                }
            }))
        } catch (err) {
            setPatientStates(prev => ({
                ...prev,
                [simplId]: {
                    ...prev[simplId],
                    resources: {
                        ...prev[simplId]?.resources,
                        [resource]: { loading: false, data: null, error: err instanceof Error ? err.message : 'Unknown error', lastFetched: null }
                    }
                }
            }))
        }
    }, [])

    const closeResource = useCallback((simplId: string, resource: string) => {
        setPatientStates(prev => {
            const r = { ...prev[simplId]?.resources }
            delete r[resource]
            return { ...prev, [simplId]: { ...prev[simplId], resources: r } }
        })
    }, [])

    // ── Relative time helper ───────────────────────────────────────────────────

    function relativeTime(d: Date | null): string {
        if (!d) return ""
        const diff = Math.floor((Date.now() - d.getTime()) / 1000)
        if (diff < 60) return "just now"
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
        return `${Math.floor(diff / 3600)}h ago`
    }

    // ── Empty state ────────────────────────────────────────────────────────────

    if (!facilityName) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <Building2 className="w-8 h-8 text-slate-400" />
                </div>
                <h2 className="text-xl font-semibold text-slate-700">Select a Facility</h2>
                <p className="text-slate-500 max-w-sm">
                    Use the facility dropdown in the top-right corner to select a facility and view its patients.
                </p>
            </div>
        )
    }

    // ── Render ─────────────────────────────────────────────────────────────────

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
                        <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-slate-500 text-sm">
                                {loadingPatients ? 'Loading...' : `${patients.length} patient${patients.length !== 1 ? 's' : ''}`}
                            </p>
                            {isSyncing && (
                                <span className="flex items-center gap-1 text-xs text-teal-600 font-medium">
                                    <Loader2 className="w-3 h-3 animate-spin" /> Analyzing...
                                </span>
                            )}
                            {!isSyncing && lastSynced && (
                                <span className="flex items-center gap-1 text-xs text-slate-400">
                                    <Clock className="w-3 h-3" /> {relativeTime(lastSynced)}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleRefresh}
                    disabled={globalRefreshing || loadingPatients || isSyncing}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-slate-200 hover:border-teal-400 hover:text-teal-600 text-slate-600 rounded-xl transition-colors shadow-sm disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${globalRefreshing ? 'animate-spin' : ''}`} />
                    {globalRefreshing ? 'Refreshing...' : 'Refresh & Re-analyze'}
                </button>
            </div>

            {/* Legend */}
            {!loadingPatients && patients.length > 0 && (
                <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                    <span className="font-medium">Priority:</span>
                    {[
                        { p: "bg-red-600 text-white", l: "Critical" },
                        { p: "bg-red-100 text-red-700 border border-red-200", l: "High" },
                        { p: "bg-amber-100 text-amber-700 border border-amber-200", l: "Medium" },
                        { p: "bg-slate-100 text-slate-400", l: "Low" },
                    ].map(({ p, l }) => (
                        <span key={l} className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${p}`}>{l}</span>
                    ))}
                    <span className="text-slate-400">· Sorted highest priority first · Hover badges for details</span>
                </div>
            )}

            {/* Patient List */}
            <div className="space-y-2">
                {loadingPatients && (
                    <div className="flex items-center justify-center py-20 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading patients...
                    </div>
                )}

                {!loadingPatients && patients.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-2">
                        <AlertCircle className="w-6 h-6" />
                        <p>No patients found for this facility.</p>
                    </div>
                )}

                {sortedPatients.map((patient) => {
                    const state = patientStates[patient.simpl_id]
                    const analysis = analyses[patient.simpl_id]
                    const isExpanded = state?.expanded ?? false
                    const openResources = Object.entries(state?.resources ?? {})

                    return (
                        <div key={patient.simpl_id} className="bg-white border border-slate-100 rounded-2xl shadow-sm">

                            {/* Patient Row */}
                            <div className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/50 transition-colors gap-4">

                                {/* Left: avatar + name */}
                                <button
                                    onClick={() => togglePatient(patient.simpl_id)}
                                    className="flex items-center gap-3 flex-shrink-0 text-left"
                                >
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors ${isExpanded ? 'bg-teal-500 text-white' : 'bg-teal-50 text-teal-600'}`}>
                                        {patient.first_name[0]}{patient.last_name[0]}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-slate-800 text-sm leading-tight">
                                            {patient.last_name}, {patient.first_name}
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-mono">{patient.simpl_id.slice(0, 8)}...</p>
                                    </div>
                                    {isExpanded
                                        ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                        : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                    }
                                </button>

                                {/* Middle: analysis badges */}
                                <div className="flex-1 min-w-0">
                                    <AnalysisBadges
                                        analysis={analysis}
                                        onViewPDPM={analysis?.pdpm ? () => setPdpmModal({ patient, analysis }) : undefined}
                                    />
                                </div>

                                {/* Right: resource chips + refresh */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <div className="hidden lg:flex items-center gap-1">
                                        {patient.resources.slice(0, 3).map(r => (
                                            <span key={r} className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 rounded">
                                                {r}
                                            </span>
                                        ))}
                                        {patient.resources.length > 3 && (
                                            <span className="text-[10px] text-slate-400">+{patient.resources.length - 3}</span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => analyzePatient(patient)}
                                        disabled={analysis?.status === "running"}
                                        className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                                        title="Re-run analysis"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${analysis?.status === "running" ? 'animate-spin' : ''}`} />
                                    </button>
                                </div>
                            </div>

                            {/* Expanded: PCC Resource Browser */}
                            {isExpanded && (
                                <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4 space-y-4">

                                    <div>
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5">
                                            Data Resources ({patient.resources.length})
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {patient.resources.map(resource => {
                                                const rs = state?.resources?.[resource]
                                                const isActive = !!rs
                                                return (
                                                    <button
                                                        key={resource}
                                                        onClick={() => isActive ? closeResource(patient.simpl_id, resource) : fetchResource(patient.simpl_id, resource)}
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                                            isActive
                                                                ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                                                                : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400 hover:text-teal-600'
                                                        }`}
                                                    >
                                                        {rs?.loading
                                                            ? <Loader2 className="w-3 h-3 animate-spin" />
                                                            : isActive ? <X className="w-3 h-3" /> : <FileJson className="w-3 h-3" />
                                                        }
                                                        {resource}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {openResources.map(([resource, rs]) => (
                                        <div key={resource} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
                                                <div className="flex items-center gap-2">
                                                    <FileJson className="w-3.5 h-3.5 text-teal-500" />
                                                    <span className="text-xs font-semibold text-slate-700">{resource}</span>
                                                    {rs.loading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                                                    {rs.lastFetched && (
                                                        <span className="text-[10px] text-slate-400">{rs.lastFetched.toLocaleTimeString()}</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => fetchResource(patient.simpl_id, resource)} className="p-1 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-md transition-colors" title="Refresh">
                                                        <RefreshCw className="w-3 h-3" />
                                                    </button>
                                                    <button onClick={() => closeResource(patient.simpl_id, resource)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-4 max-h-80 overflow-y-auto">
                                                {rs.loading && (
                                                    <div className="flex items-center gap-2 text-sm text-slate-400 py-4 justify-center">
                                                        <Loader2 className="w-4 h-4 animate-spin" /> Fetching {resource}...
                                                    </div>
                                                )}
                                                {rs.error && (
                                                    <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-3">
                                                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{rs.error}
                                                    </div>
                                                )}
                                                {rs.data != null && !rs.loading && (
                                                    <ResourceDataRenderer resource={resource} data={rs.data} />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>

        {/* PDPM Report Modal */}
        {pdpmModal && (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
                onClick={() => setPdpmModal(null)}
            >
                <div onClick={e => e.stopPropagation()} className="relative w-full max-w-2xl">
                    <PDPMReportCard
                        patientName={`${pdpmModal.patient.last_name}, ${pdpmModal.patient.first_name}`}
                        facility={pdpmModal.patient.facility}
                        result={pdpmModal.analysis.pdpm!}
                        onClose={() => setPdpmModal(null)}
                    />
                </div>
            </div>
        )}
    )
}

export default function PatientsPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center py-32 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...
            </div>
        }>
            <PatientsView />
        </Suspense>
    )
}
