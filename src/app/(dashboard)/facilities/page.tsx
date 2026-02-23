"use client"
import { useState, useEffect, useCallback } from "react"
import { Building2, Search, ChevronDown, ChevronRight, Loader2, Database, RefreshCw, X, FileJson } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface Facility {
    id: string;
    name: string;
    type?: string;
}

interface ResourceSummary {
    available_resources?: string[];
    resources?: string[];
    [key: string]: unknown;
}

interface FacilityPccState {
    loading: boolean;
    summary: ResourceSummary | null;
    error: string | null;
    expandedResources: Record<string, { loading: boolean; data: unknown; error: string | null }>;
}

export default function FacilitiesPage() {
    const [facilities, setFacilities] = useState<Facility[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [pccStates, setPccStates] = useState<Record<string, FacilityPccState>>({});
    const [expandedFacility, setExpandedFacility] = useState<string | null>(null);
    const supabase = createClient();

    useEffect(() => {
        const fetchFacilities = async () => {
            const { data, error } = await supabase
                .from('facilities')
                .select('*')
                .order('name');

            if (error) {
                console.error("Error fetching facilities:", error);
            } else {
                setFacilities(data || []);
            }
            setIsLoading(false);
        };

        fetchFacilities();
    }, [supabase]);

    const loadPccSummary = useCallback(async (facilityId: string) => {
        setPccStates(prev => ({
            ...prev,
            [facilityId]: { loading: true, summary: null, error: null, expandedResources: {} }
        }));
        setExpandedFacility(facilityId);

        try {
            const res = await fetch(`/api/v1/pcc/${facilityId}/summary`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error ?? `Request failed with status ${res.status}`);
            }

            setPccStates(prev => ({
                ...prev,
                [facilityId]: { loading: false, summary: data, error: null, expandedResources: {} }
            }));
        } catch (err) {
            setPccStates(prev => ({
                ...prev,
                [facilityId]: {
                    loading: false,
                    summary: null,
                    error: err instanceof Error ? err.message : 'Unknown error',
                    expandedResources: {}
                }
            }));
        }
    }, []);

    const loadResource = useCallback(async (facilityId: string, resource: string) => {
        setPccStates(prev => ({
            ...prev,
            [facilityId]: {
                ...prev[facilityId],
                expandedResources: {
                    ...prev[facilityId]?.expandedResources,
                    [resource]: { loading: true, data: null, error: null }
                }
            }
        }));

        try {
            const res = await fetch(`/api/v1/pcc/${facilityId}/data/${resource}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error ?? `Request failed with status ${res.status}`);
            }

            setPccStates(prev => ({
                ...prev,
                [facilityId]: {
                    ...prev[facilityId],
                    expandedResources: {
                        ...prev[facilityId]?.expandedResources,
                        [resource]: { loading: false, data, error: null }
                    }
                }
            }));
        } catch (err) {
            setPccStates(prev => ({
                ...prev,
                [facilityId]: {
                    ...prev[facilityId],
                    expandedResources: {
                        ...prev[facilityId]?.expandedResources,
                        [resource]: {
                            loading: false,
                            data: null,
                            error: err instanceof Error ? err.message : 'Unknown error'
                        }
                    }
                }
            }));
        }
    }, []);

    const closeResource = useCallback((facilityId: string, resource: string) => {
        setPccStates(prev => {
            const newExpanded = { ...prev[facilityId]?.expandedResources };
            delete newExpanded[resource];
            return {
                ...prev,
                [facilityId]: { ...prev[facilityId], expandedResources: newExpanded }
            };
        });
    }, []);

    const getResources = (summary: ResourceSummary | null): string[] => {
        if (!summary) return [];
        if (Array.isArray(summary.available_resources)) return summary.available_resources;
        if (Array.isArray(summary.resources)) return summary.resources;
        // Fallback: collect any array values in the summary
        return Object.values(summary)
            .filter(Array.isArray)
            .flat()
            .filter((v): v is string => typeof v === 'string');
    };

    const filtered = facilities.filter(f =>
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        f.id.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-sm border border-indigo-200/50">
                    <Building2 className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Facilities</h1>
                    <p className="text-slate-500 text-sm">Browse facilities and explore live PointClickCare data resources</p>
                </div>
            </div>

            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <h2 className="text-lg font-bold text-slate-800">
                        {isLoading ? "Loading..." : `${filtered.length} Facilit${filtered.length === 1 ? 'y' : 'ies'}`}
                    </h2>
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search facilities..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>
                </div>

                <div className="space-y-3">
                    {isLoading && (
                        <div className="flex items-center justify-center py-12 text-slate-400">
                            <Database className="w-6 h-6 animate-pulse mr-2" />
                            Querying facilities...
                        </div>
                    )}

                    {!isLoading && filtered.length === 0 && (
                        <div className="text-center py-12 text-slate-400">
                            No facilities found.
                        </div>
                    )}

                    {filtered.map((fac) => {
                        const state = pccStates[fac.id];
                        const isExpanded = expandedFacility === fac.id;
                        const resources = getResources(state?.summary ?? null);
                        const hasLoaded = state && !state.loading && (state.summary || state.error);

                        return (
                            <div key={fac.id} className="border border-slate-100 rounded-2xl overflow-hidden">
                                {/* Facility Row */}
                                <div className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/60 transition-colors">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                                            <Building2 className="w-4 h-4 text-indigo-500" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-slate-800 text-sm">{fac.name}</p>
                                            <p className="font-mono text-xs text-slate-400 truncate">{fac.id}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-md flex items-center gap-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> Active
                                        </span>
                                        <button
                                            onClick={() => {
                                                if (isExpanded && hasLoaded) {
                                                    setExpandedFacility(null);
                                                } else {
                                                    loadPccSummary(fac.id);
                                                }
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                                        >
                                            {state?.loading ? (
                                                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</>
                                            ) : isExpanded && hasLoaded ? (
                                                <><ChevronDown className="w-3.5 h-3.5" /> Hide PCC Data</>
                                            ) : (
                                                <><ChevronRight className="w-3.5 h-3.5" /> Load PCC Data</>
                                            )}
                                        </button>
                                        {hasLoaded && (
                                            <button
                                                onClick={() => loadPccSummary(fac.id)}
                                                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                                title="Refresh"
                                            >
                                                <RefreshCw className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* PCC Data Panel */}
                                {isExpanded && (
                                    <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-5">
                                        {state?.loading && (
                                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Fetching summary from PCC consumer service...
                                            </div>
                                        )}

                                        {state?.error && (
                                            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-4">
                                                <span className="font-semibold">Error:</span> {state.error}
                                            </div>
                                        )}

                                        {state?.summary && (
                                            <div className="space-y-4">
                                                {/* Available Resources */}
                                                {resources.length > 0 ? (
                                                    <div>
                                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                                                            Available Resources ({resources.length})
                                                        </p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {resources.map((resource) => {
                                                                const rs = state.expandedResources?.[resource];
                                                                const isActive = !!rs;
                                                                return (
                                                                    <button
                                                                        key={resource}
                                                                        onClick={() => {
                                                                            if (isActive) {
                                                                                closeResource(fac.id, resource);
                                                                            } else {
                                                                                loadResource(fac.id, resource);
                                                                            }
                                                                        }}
                                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                                                            isActive
                                                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                                                : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-400 hover:text-indigo-600'
                                                                        }`}
                                                                    >
                                                                        {rs?.loading ? (
                                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                                        ) : isActive ? (
                                                                            <X className="w-3 h-3" />
                                                                        ) : (
                                                                            <FileJson className="w-3 h-3" />
                                                                        )}
                                                                        {resource}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                                            Summary Response
                                                        </p>
                                                        <pre className="text-xs text-slate-600 bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto max-h-64 leading-relaxed">
                                                            {JSON.stringify(state.summary, null, 2)}
                                                        </pre>
                                                    </div>
                                                )}

                                                {/* Resource Data Panels */}
                                                {Object.entries(state.expandedResources ?? {}).map(([resource, rs]) => (
                                                    <div key={resource} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                                                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                                                            <div className="flex items-center gap-2">
                                                                <FileJson className="w-4 h-4 text-indigo-500" />
                                                                <span className="text-sm font-semibold text-slate-800">{resource}</span>
                                                                {rs.loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                                                            </div>
                                                            <button
                                                                onClick={() => closeResource(fac.id, resource)}
                                                                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        <div className="p-4">
                                                            {rs.loading && (
                                                                <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                    Fetching {resource} data...
                                                                </div>
                                                            )}
                                                            {rs.error && (
                                                                <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
                                                                    {rs.error}
                                                                </p>
                                                            )}
                                                            {rs.data && !rs.loading && (
                                                                <pre className="text-xs text-slate-600 overflow-x-auto max-h-96 leading-relaxed whitespace-pre-wrap">
                                                                    {JSON.stringify(rs.data, null, 2)}
                                                                </pre>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    )
}
