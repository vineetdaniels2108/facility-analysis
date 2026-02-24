"use client"

import { X, ClipboardList, TrendingUp, AlertTriangle, CheckCircle2, DollarSign } from "lucide-react"

// ─── Types (mirroring the Python response) ───────────────────────────────────

interface PDPMComponent {
    group: string
    cmi: number
    dailyRate: number
    baseRate: number
    functionalLevel?: string
    bimsScore?: number
    cognitiveLevel?: string
    hasSwallowingDisorder?: boolean
    slpComorbidities?: string[]
    extensiveServices?: string[]
    hasDepression?: boolean
    totalScore?: number
    description?: string
    items?: Array<{ condition: string; label: string; points: number; mds_item: string }>
}

interface PDPMResult {
    success?: boolean
    error?: string
    hasData?: boolean
    clinicalProfile?: {
        primaryCategory: string
        drivingConditions: string[]
        functionalScore: number
        bimsScore: number
        cognitiveLevel: string
        hasDepression: boolean
        conditionsCount: number
        medicationsCount: number
    }
    components?: {
        PT?: PDPMComponent
        OT?: PDPMComponent
        SLP?: PDPMComponent
        Nursing?: PDPMComponent
        NTA?: PDPMComponent
        NonCaseMix?: { dailyRate: number }
    }
    financials?: {
        totalDailyRate: number
        estimated30Day: number
        vpdProjections?: { "20_day": number; "60_day": number; "100_day": number }
    }
    documentationRecommendations?: Array<{ title: string; detail: string }>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
    return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ComponentRow({
    label, group, cmi, dailyRate, sub
}: {
    label: string; group: string; cmi: number; dailyRate: number; sub?: string
}) {
    return (
        <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">{label}</span>
                    <span className="px-2 py-0.5 text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200 rounded-md">{group}</span>
                </div>
                {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
            </div>
            <div className="text-right ml-4 flex-shrink-0">
                <p className="text-sm font-bold text-slate-800">{fmt(dailyRate)}<span className="text-[11px] font-normal text-slate-400">/day</span></p>
                <p className="text-[11px] text-slate-400">CMI: {cmi.toFixed(2)}</p>
            </div>
        </div>
    )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PDPMReportCard({
    patientName,
    facility,
    result,
    onClose,
}: {
    patientName: string
    facility: string
    result: PDPMResult
    onClose: () => void
}) {
    const profile = result.clinicalProfile
    const comps   = result.components
    const fin     = result.financials
    const recs    = result.documentationRecommendations ?? []
    const nta     = comps?.NTA

    if (result.error === "unavailable") {
        return (
            <div className="p-6 text-center text-slate-500">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
                <p className="font-semibold">Analysis backend unavailable</p>
                <p className="text-sm mt-1">Start the Railway backend to see PDPM analysis.</p>
            </div>
        )
    }

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-w-2xl w-full">

            {/* Header */}
            <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-6 py-5 text-white">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <ClipboardList className="w-5 h-5 opacity-80" />
                            <span className="text-sm font-medium opacity-80 uppercase tracking-wide">PDPM Analysis Report</span>
                        </div>
                        <h2 className="text-xl font-bold">{patientName}</h2>
                        <p className="text-sm opacity-70 mt-0.5">{facility}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                        {fin && (
                            <>
                                <p className="text-3xl font-bold">{fmt(fin.totalDailyRate)}</p>
                                <p className="text-sm opacity-70">Total Daily Rate</p>
                                <p className="text-base font-semibold mt-1">{fmt(fin.estimated30Day)}</p>
                                <p className="text-xs opacity-70">Est. 30-Day</p>
                            </>
                        )}
                    </div>
                </div>
                {profile && (
                    <div className="flex flex-wrap gap-2 mt-4">
                        <span className="px-2.5 py-1 bg-white/20 rounded-lg text-xs font-semibold">
                            {profile.primaryCategory}
                        </span>
                        <span className="px-2.5 py-1 bg-white/20 rounded-lg text-xs font-semibold">
                            NTA Score: {nta?.totalScore ?? 0} pts
                        </span>
                        <span className="px-2.5 py-1 bg-white/20 rounded-lg text-xs font-semibold">
                            {profile.conditionsCount} Conditions · {profile.medicationsCount} Medications
                        </span>
                        {!result.hasData && (
                            <span className="px-2.5 py-1 bg-amber-400/30 border border-amber-300/50 rounded-lg text-xs font-semibold">
                                ⚠ Based on defaults — no structured data yet
                            </span>
                        )}
                    </div>
                )}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="overflow-y-auto max-h-[70vh]">

                {/* Clinical Profile */}
                {profile && (
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Clinical Profile</h3>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                            <div>
                                <span className="text-slate-500">Clinical Category</span>
                                <span className="float-right font-semibold text-slate-800">{profile.primaryCategory}</span>
                            </div>
                            <div>
                                <span className="text-slate-500">Functional Score</span>
                                <span className="float-right font-semibold text-slate-800">{profile.functionalScore}/96</span>
                            </div>
                            <div>
                                <span className="text-slate-500">BIMS Score</span>
                                <span className="float-right font-semibold text-slate-800">{profile.bimsScore}/15</span>
                            </div>
                            <div>
                                <span className="text-slate-500">Cognitive Status</span>
                                <span className="float-right font-semibold text-slate-800">{profile.cognitiveLevel}</span>
                            </div>
                            <div>
                                <span className="text-slate-500">Depression Flag</span>
                                <span className="float-right font-semibold text-slate-800">{profile.hasDepression ? "Yes" : "No"}</span>
                            </div>
                        </div>
                        {profile.drivingConditions.length > 0 && (
                            <div className="mt-3">
                                <p className="text-[11px] text-slate-400 uppercase font-semibold tracking-wide mb-1">Driving Conditions</p>
                                <p className="text-xs text-slate-600">{profile.drivingConditions.join(", ")}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* PDPM Components */}
                {comps && (
                    <div className="px-6 py-4 border-b border-slate-100">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">PDPM Component Classification</h3>
                        <p className="text-[11px] text-slate-400 mb-3">CMS FY2025 Urban SNF Rates</p>
                        <div>
                            {comps.PT && (
                                <ComponentRow
                                    label="Physical Therapy (PT)"
                                    group={comps.PT.group}
                                    cmi={comps.PT.cmi}
                                    dailyRate={comps.PT.dailyRate}
                                    sub={`Functional Level: ${comps.PT.functionalLevel} · Base: $${comps.PT.baseRate}/day`}
                                />
                            )}
                            {comps.OT && (
                                <ComponentRow
                                    label="Occupational Therapy (OT)"
                                    group={comps.OT.group}
                                    cmi={comps.OT.cmi}
                                    dailyRate={comps.OT.dailyRate}
                                    sub={`Functional Level: ${comps.OT.functionalLevel} · Base: $${comps.OT.baseRate}/day`}
                                />
                            )}
                            {comps.SLP && (
                                <ComponentRow
                                    label="Speech-Language Pathology (SLP)"
                                    group={comps.SLP.group}
                                    cmi={comps.SLP.cmi}
                                    dailyRate={comps.SLP.dailyRate}
                                    sub={`BIMS: ${comps.SLP.bimsScore}/15 · ${comps.SLP.cognitiveLevel}${comps.SLP.slpComorbidities?.length ? ` · ${comps.SLP.slpComorbidities.join(", ")}` : ""}`}
                                />
                            )}
                            {comps.Nursing && (
                                <ComponentRow
                                    label="Nursing Services"
                                    group={comps.Nursing.group}
                                    cmi={comps.Nursing.cmi}
                                    dailyRate={comps.Nursing.dailyRate}
                                    sub={`Depression: ${comps.Nursing.hasDepression ? "Yes" : "No"}${comps.Nursing.extensiveServices?.length ? ` · ${comps.Nursing.extensiveServices.join(", ")}` : ""}`}
                                />
                            )}
                            {comps.NTA && (
                                <ComponentRow
                                    label="Non-Therapy Ancillary (NTA)"
                                    group={comps.NTA.group}
                                    cmi={comps.NTA.cmi}
                                    dailyRate={comps.NTA.dailyRate}
                                    sub={`Score: ${comps.NTA.totalScore} pts · ${comps.NTA.description}`}
                                />
                            )}
                            {comps.NonCaseMix && (
                                <div className="flex items-center justify-between py-3">
                                    <span className="text-sm text-slate-500">Non-Case-Mix</span>
                                    <span className="text-sm font-bold text-slate-800">{fmt(comps.NonCaseMix.dailyRate)}<span className="text-[11px] font-normal text-slate-400">/day</span></span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* NTA Breakdown */}
                {nta?.items && nta.items.length > 0 && (
                    <div className="px-6 py-4 border-b border-slate-100">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">NTA Comorbidity Breakdown</h3>
                        <div className="space-y-1.5">
                            {nta.items.map((item, i) => (
                                <div key={i} className="flex items-start gap-3 text-sm">
                                    <span className="flex-shrink-0 w-12 text-right font-bold text-teal-700">+{item.points} pts</span>
                                    <div>
                                        <span className="text-slate-700">{item.label}</span>
                                        <span className="text-slate-400 text-[11px] ml-2">— {item.condition}</span>
                                    </div>
                                </div>
                            ))}
                            <div className="flex items-center gap-3 text-sm pt-2 border-t border-slate-100 mt-2">
                                <span className="w-12 text-right font-bold text-slate-800">{nta.totalScore} pts</span>
                                <span className="font-semibold text-slate-700">Total NTA Score → Group {nta.group} (CMI {nta.cmi})</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Financial Projections */}
                {fin?.vpdProjections && (
                    <div className="px-6 py-4 border-b border-slate-100">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                            <DollarSign className="w-3.5 h-3.5 inline mr-1" />
                            Variable Per Diem Projections
                        </h3>
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: "20-Day Stay", value: fin.vpdProjections["20_day"], sub: "Full rate (Days 1–20)" },
                                { label: "60-Day Stay", value: fin.vpdProjections["60_day"], sub: "VPD adjusted (Days 21–60)" },
                                { label: "100-Day Stay", value: fin.vpdProjections["100_day"], sub: "VPD adjusted (Days 61–100)" },
                            ].map(({ label, value, sub }) => (
                                <div key={label} className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                                    <p className="text-[11px] text-slate-500 font-semibold mb-1">{label}</p>
                                    <p className="text-base font-bold text-slate-800">{fmt(value)}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Documentation Recommendations */}
                {recs.length > 0 && (
                    <div className="px-6 py-4">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                            <TrendingUp className="w-3.5 h-3.5 inline mr-1" />
                            Documentation Recommendations
                        </h3>
                        <div className="space-y-3">
                            {recs.map((rec, i) => (
                                <div key={i} className="flex gap-3">
                                    <CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-semibold text-slate-700">{rec.title}</p>
                                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{rec.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Compliance note */}
                <div className="px-6 py-3 bg-slate-50 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                        Analysis uses CMS FY2025 published rates and classification methodology. Functional and cognitive scores are estimated from documented clinical conditions. Formal PDPM classification requires MDS 3.0 assessment. All estimates are conservative. — Simpl Healthcare Inc.
                    </p>
                </div>
            </div>
        </div>
    )
}
