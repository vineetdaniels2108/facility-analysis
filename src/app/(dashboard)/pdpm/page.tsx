"use client"
import { useState, useEffect } from "react"
import { ClipboardList, AlertCircle, Loader2 } from "lucide-react"

import { submitPDPMAnalysis } from "@/lib/api/ai"

interface PatientSummary {
    simpl_id: string;
    first_name: string;
    last_name: string;
    facility: string;
}

export default function PDPMPage() {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [patients, setPatients] = useState<PatientSummary[]>([]);
    const [selectedPatientId, setSelectedPatientId] = useState("");
    const [results, setResults] = useState<any[]>([]);

    useEffect(() => {
        // Fetch list of available patients
        fetch("/api/patients")
            .then(res => res.json())
            .then(data => {
                if (data.patients) {
                    setPatients(data.patients);
                    if (data.patients.length > 0) {
                        setSelectedPatientId(data.patients[0].simpl_id);
                    }
                }
            })
            .catch(console.error);
    }, []);

    const handleRunAnalysis = async () => {
        if (!selectedPatientId) return;
        setIsAnalyzing(true);
        try {
            // 1. Fetch live aggregated PointClickCare Data (from our mock CSV pipeline)
            const syncRes = await fetch(`/api/patients/${selectedPatientId}/sync`);
            const syncData = await syncRes.json();

            if (!syncData.success) {
                alert("Failed to fetch PointClickCare clinical records for patient.");
                return;
            }

            // Extract relevant JSON observations for the Python Engine
            const rawData = syncData.patientData.data;
            const patientPayload = {
                simplId: selectedPatientId,
                conditions: rawData.DIAGNOSTICREPORTS || [],
                medications: [],
                labs: {},
                vitals: {},
                functional_score: 9, // Replace with real mapping
                bims_score: 13, // Replace with real mapping
                clinical_category: "Medical Management",
                has_depression_flag: false
            };

            // 2. Submit to Python FastAPI Microservice
            const aiResult = await submitPDPMAnalysis(patientPayload);

            setResults([aiResult, ...results]);
            alert(`✅ Python AI Engine Success!\n\nPatient: ${aiResult.patientId}\nNTA Points: ${aiResult.components.NTA.total_score}\nNursing Class: ${aiResult.components.Nursing.group}`);
        } catch (error) {
            console.error(error);
            alert("❌ Analysis Failed. Check terminal for python/Next.js errors.");
        } finally {
            setIsAnalyzing(false);
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-sm border border-amber-200/50">
                    <ClipboardList className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">PDPM Analysis</h1>
                    <p className="text-slate-500 text-sm">Patient-Driven Payment Model & NTA Comorbidities</p>
                </div>
            </div>

            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <h2 className="text-lg font-bold text-slate-800">Live AI Evaluations</h2>

                    <div className="flex items-center gap-3">
                        <select
                            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl px-4 py-2"
                            value={selectedPatientId}
                            onChange={(e) => setSelectedPatientId(e.target.value)}
                        >
                            {patients.slice(0, 50).map(p => (
                                <option key={p.simpl_id} value={p.simpl_id}>{p.first_name} {p.last_name}</option>
                            ))}
                        </select>

                        <button
                            onClick={handleRunAnalysis}
                            disabled={isAnalyzing || !selectedPatientId}
                            className="px-4 py-2 bg-primary-50 hover:bg-primary-100 text-primary-700 font-medium rounded-xl transition-colors text-sm flex items-center gap-2 disabled:opacity-50">
                            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Run Model on Patient"}
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-4 rounded-tl-xl">Patient ID</th>
                                <th className="px-6 py-4">PT Class</th>
                                <th className="px-6 py-4">OT Class</th>
                                <th className="px-6 py-4">SLP Class</th>
                                <th className="px-6 py-4">Nursing Group</th>
                                <th className="px-6 py-4">NTA Points</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {results.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                                        No recent evaluations. Select a patient and run the model.
                                    </td>
                                </tr>
                            )}
                            {results.map((result, i) => (
                                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 font-semibold text-slate-700">{result.patientId.slice(0, 8)}...</td>
                                    <td className="px-6 py-4 text-slate-600">{result.components?.PT_OT?.pt_group || 'N/A'}</td>
                                    <td className="px-6 py-4 text-slate-600">{result.components?.PT_OT?.ot_group || 'N/A'}</td>
                                    <td className="px-6 py-4 text-slate-600">{result.components?.SLP?.group || 'N/A'}</td>
                                    <td className="px-6 py-4 text-slate-600">{result.components?.Nursing?.group || 'N/A'}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-700`}>
                                            {result.components?.NTA?.total_score} pts
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
