"use client"
import { useState, useEffect } from "react"
import { Syringe, AlertCircle, Loader2 } from "lucide-react"
import { submitInfusionAnalysis } from "@/lib/api/ai"

interface PatientSummary {
    simpl_id: string;
    first_name: string;
    last_name: string;
    facility: string;
}

export default function InfusionPage() {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [patients, setPatients] = useState<PatientSummary[]>([]);
    const [selectedPatientId, setSelectedPatientId] = useState("");
    const [results, setResults] = useState<any[]>([]);

    useEffect(() => {
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
            // 1. Fetch live aggregated PointClickCare Data
            const syncRes = await fetch(`/api/patients/${selectedPatientId}/sync`);
            const syncData = await syncRes.json();

            if (!syncData.success) {
                alert("Failed to fetch PointClickCare clinical records.");
                return;
            }

            const rawData = syncData.patientData.data;
            const patientPayload = {
                simplId: selectedPatientId,
                conditions: [],
                medications: [],
                // We mock the lab structure, or parse from OBSERVATIONS (depending on the Python engine expectations)
                labs: {
                    "Albumin": 2.1,
                    "BUN": 45.0,
                    "Creatinine": 1.9,
                    "Sodium": 150,
                    "Potassium": 5.2
                },
                vitals: {},
                functional_score: 10,
                bims_score: 15,
                clinical_category: "Medical Management",
                has_depression_flag: false
            };

            const aiResult = await submitInfusionAnalysis(patientPayload);
            setResults([aiResult, ...results]);

            alert(`✅ Python AI Engine Success!\n\nPatient: ${aiResult.patientId}\nInfusion Score: ${aiResult.score}\nPriority: ${aiResult.priority}\nReasons: ${aiResult.reasons.join(", ")}`);
        } catch (error) {
            console.error(error);
            alert("❌ Analysis Failed. Check terminal for errors.");
        } finally {
            setIsAnalyzing(false);
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-sm border border-blue-200/50">
                    <Syringe className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Infusion Analysis</h1>
                    <p className="text-slate-500 text-sm">Identifying candidates for required infusion and antibiotic therapies</p>
                </div>
            </div>

            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <h2 className="text-lg font-bold text-slate-800">Infusion Candidates</h2>

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
                            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Scan Recent Labs"}
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-4 rounded-tl-xl">Patient ID</th>
                                <th className="px-6 py-4">Priority</th>
                                <th className="px-6 py-4 rounded-tr-xl">Reasoning</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {results.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                                        No recent evaluations. Select a patient and scan labs.
                                    </td>
                                </tr>
                            )}
                            {results.map((candidate, i) => (
                                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 font-semibold text-slate-700 whitespace-nowrap">{candidate.patientId.slice(0, 8)}...</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${candidate.priority === 'High' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                            }`}>
                                            {candidate.priority}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-500 line-clamp-2">{candidate.reasons.join(", ")}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
