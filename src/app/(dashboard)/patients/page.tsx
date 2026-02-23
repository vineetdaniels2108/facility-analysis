"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
    Users, ChevronRight, ChevronDown, Loader2, RefreshCw,
    FileJson, X, Building2, AlertCircle
} from "lucide-react"

interface PatientSummary {
    simpl_id: string;
    first_name: string;
    last_name: string;
    facility: string;
    resources: string[];
}

interface ResourceState {
    loading: boolean;
    data: unknown;
    error: string | null;
    lastFetched: Date | null;
}

interface PatientState {
    expanded: boolean;
    refreshing: boolean;
    resources: Record<string, ResourceState>;
}

function PatientsView() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const facilityName = searchParams.get('facility') ?? '';

    const [patients, setPatients] = useState<PatientSummary[]>([]);
    const [loadingPatients, setLoadingPatients] = useState(true);
    const [patientStates, setPatientStates] = useState<Record<string, PatientState>>({});
    const [globalRefreshing, setGlobalRefreshing] = useState(false);

    // Fetch patient list for the selected facility
    const loadPatients = useCallback(async (facility: string) => {
        setLoadingPatients(true);
        setPatientStates({});
        try {
            const url = facility
                ? `/api/patients?facility=${encodeURIComponent(facility)}`
                : '/api/patients';
            const res = await fetch(url);
            const data = await res.json();
            setPatients(data.patients ?? []);
        } catch (e) {
            console.error(e);
            setPatients([]);
        } finally {
            setLoadingPatients(false);
        }
    }, []);

    useEffect(() => {
        loadPatients(facilityName);
    }, [facilityName, loadPatients]);

    // Toggle patient row expansion
    const togglePatient = useCallback((simplId: string) => {
        setPatientStates(prev => ({
            ...prev,
            [simplId]: {
                ...prev[simplId],
                expanded: !prev[simplId]?.expanded,
                refreshing: false,
                resources: prev[simplId]?.resources ?? {},
            }
        }));
    }, []);

    // Fetch a single resource for a patient from the real PCC API
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
        }));

        try {
            const res = await fetch(`/api/v1/pcc/${simplId}/data/${resource}`);
            const data = await res.json();

            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

            setPatientStates(prev => ({
                ...prev,
                [simplId]: {
                    ...prev[simplId],
                    resources: {
                        ...prev[simplId]?.resources,
                        [resource]: { loading: false, data, error: null, lastFetched: new Date() }
                    }
                }
            }));
        } catch (err) {
            setPatientStates(prev => ({
                ...prev,
                [simplId]: {
                    ...prev[simplId],
                    resources: {
                        ...prev[simplId]?.resources,
                        [resource]: {
                            loading: false, data: null,
                            error: err instanceof Error ? err.message : 'Unknown error',
                            lastFetched: null
                        }
                    }
                }
            }));
        }
    }, []);

    // Dismiss an open resource panel
    const closeResource = useCallback((simplId: string, resource: string) => {
        setPatientStates(prev => {
            const newResources = { ...prev[simplId]?.resources };
            delete newResources[resource];
            return { ...prev, [simplId]: { ...prev[simplId], resources: newResources } };
        });
    }, []);

    // Refresh all open resources for a single patient
    const refreshPatient = useCallback(async (patient: PatientSummary) => {
        setPatientStates(prev => ({
            ...prev,
            [patient.simpl_id]: { ...prev[patient.simpl_id], refreshing: true }
        }));

        const openResources = Object.keys(patientStates[patient.simpl_id]?.resources ?? {});
        const resourcesToFetch = openResources.length > 0 ? openResources : patient.resources;

        await Promise.all(resourcesToFetch.map(r => fetchResource(patient.simpl_id, r)));

        setPatientStates(prev => ({
            ...prev,
            [patient.simpl_id]: { ...prev[patient.simpl_id], refreshing: false }
        }));
    }, [fetchResource, patientStates]);

    // Refresh ALL patients in the current view
    const refreshAll = useCallback(async () => {
        setGlobalRefreshing(true);
        await Promise.all(patients.map(p => refreshPatient(p)));
        setGlobalRefreshing(false);
    }, [patients, refreshPatient]);

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
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-600 flex items-center justify-center shadow-sm border border-teal-200/50">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{facilityName}</h1>
                        <p className="text-slate-500 text-sm">
                            {loadingPatients ? 'Loading patients...' : `${patients.length} patient${patients.length !== 1 ? 's' : ''} — live data from PointClickCare`}
                        </p>
                    </div>
                </div>

                <button
                    onClick={refreshAll}
                    disabled={globalRefreshing || loadingPatients}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-slate-200 hover:border-teal-400 hover:text-teal-600 text-slate-600 rounded-xl transition-colors shadow-sm disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${globalRefreshing ? 'animate-spin' : ''}`} />
                    {globalRefreshing ? 'Refreshing...' : 'Refresh All from AWS'}
                </button>
            </div>

            {/* Patient List */}
            <div className="space-y-2">
                {loadingPatients && (
                    <div className="flex items-center justify-center py-20 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Loading patients...
                    </div>
                )}

                {!loadingPatients && patients.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-2">
                        <AlertCircle className="w-6 h-6" />
                        <p>No patients found for this facility.</p>
                    </div>
                )}

                {patients.map((patient) => {
                    const state = patientStates[patient.simpl_id];
                    const isExpanded = state?.expanded ?? false;
                    const openResources = Object.entries(state?.resources ?? {});

                    return (
                        <div key={patient.simpl_id} className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">

                            {/* Patient Row */}
                            <div className="flex items-center justify-between px-5 py-4 hover:bg-slate-50/50 transition-colors">
                                <button
                                    onClick={() => togglePatient(patient.simpl_id)}
                                    className="flex items-center gap-3 flex-1 text-left min-w-0"
                                >
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold transition-colors ${isExpanded ? 'bg-teal-500 text-white' : 'bg-teal-50 text-teal-600'}`}>
                                        {patient.first_name[0]}{patient.last_name[0]}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-slate-800 text-sm">
                                            {patient.last_name}, {patient.first_name}
                                        </p>
                                        <p className="text-xs text-slate-400 font-mono truncate">{patient.simpl_id}</p>
                                    </div>
                                    {isExpanded
                                        ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0 ml-2" />
                                        : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 ml-2" />
                                    }
                                </button>

                                {/* Resource chips (always visible) */}
                                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                                    <div className="hidden md:flex items-center gap-1.5">
                                        {patient.resources.slice(0, 4).map(r => (
                                            <span key={r} className="px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 rounded-md">
                                                {r}
                                            </span>
                                        ))}
                                        {patient.resources.length > 4 && (
                                            <span className="text-[10px] text-slate-400">+{patient.resources.length - 4}</span>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => refreshPatient(patient)}
                                        disabled={state?.refreshing}
                                        className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                                        title="Refresh from AWS"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${state?.refreshing ? 'animate-spin' : ''}`} />
                                    </button>
                                </div>
                            </div>

                            {/* Expanded: Resource Buttons + Data Panels */}
                            {isExpanded && (
                                <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4 space-y-4">

                                    {/* Resource Buttons */}
                                    <div>
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5">
                                            Data Resources ({patient.resources.length})
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {patient.resources.map(resource => {
                                                const rs = state?.resources?.[resource];
                                                const isActive = !!rs;
                                                const isLoading = rs?.loading;
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
                                                        {isLoading
                                                            ? <Loader2 className="w-3 h-3 animate-spin" />
                                                            : isActive
                                                                ? <X className="w-3 h-3" />
                                                                : <FileJson className="w-3 h-3" />
                                                        }
                                                        {resource}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Data Panels */}
                                    {openResources.map(([resource, rs]) => (
                                        <div key={resource} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
                                                <div className="flex items-center gap-2">
                                                    <FileJson className="w-3.5 h-3.5 text-teal-500" />
                                                    <span className="text-xs font-semibold text-slate-700">{resource}</span>
                                                    {rs.loading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                                                    {rs.lastFetched && (
                                                        <span className="text-[10px] text-slate-400">
                                                            {rs.lastFetched.toLocaleTimeString()}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => fetchResource(patient.simpl_id, resource)}
                                                        className="p-1 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-md transition-colors"
                                                        title="Refresh resource"
                                                    >
                                                        <RefreshCw className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        onClick={() => closeResource(patient.simpl_id, resource)}
                                                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-4 max-h-80 overflow-y-auto">
                                                {rs.loading && (
                                                    <div className="flex items-center gap-2 text-sm text-slate-400 py-4 justify-center">
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Fetching {resource} from AWS...
                                                    </div>
                                                )}
                                                {rs.error && (
                                                    <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-3">
                                                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                                        {rs.error}
                                                    </div>
                                                )}
                                                {rs.data != null && !rs.loading && (
                                                    <pre className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap break-words">
                                                        {JSON.stringify(rs.data, null, 2)}
                                                    </pre>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function PatientsPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center py-32 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading...
            </div>
        }>
            <PatientsView />
        </Suspense>
    );
}
