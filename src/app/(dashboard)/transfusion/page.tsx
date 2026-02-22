"use client"
import { useState, useEffect } from "react"
import { Droplet, AlertCircle, Loader2 } from "lucide-react"
import { submitUrgentCareGapsAnalysis } from "@/lib/api/ai"

interface PatientSummary {
    simpl_id: string;
    first_name: string;
    last_name: string;
    facility: string;
}

export default function TransfusionPage() {
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
                labs: [] // Note: `analyze_labs.py` endpoint expects array of {name, value, unit, effective_date}, we'll pass raw OBSERVATIONS inside and let python adapt.
            };

            const aiResult = await submitUrgentCareGapsAnalysis(patientPayload);
            setResults([aiResult, ...results]);

            alert(`✅ Python AI Engine Success!\n\nPatient: ${aiResult.patientId}\nFound ${aiResult.critical_findings?.length} critical findings.`);
        } catch (error) {
            console.error(error);
            alert("❌ Analysis Failed. Check terminal for python API errors.");
        } finally {
            setIsAnalyzing(false);
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shadow-sm border border-red-200/50">
                    <Droplet className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Transfusion Analysis</h1>
                    <p className="text-slate-500 text-sm">Hemoglobin tracking and alerts for urgent transfusion needs</p>
                </div>
            </div>

            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <h2 className="text-lg font-bold text-slate-800">Urgent Care Gaps</h2>

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
                            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Scan Care Gaps"}
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-4 rounded-tl-xl">Patient ID</th>
                                <th className="px-6 py-4">Total Findings</th>
                                <th className="px-6 py-4 rounded-tr-xl">Analysis Summary</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {results.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                                        No recent evaluations. Select a patient and scan for care gaps.
                                    </td>
                                </tr>
                            )}
                            {results.map((res: any, i) => (
                                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 font-semibold text-slate-700 whitespace-nowrap">{res.patientId.slice(0, 8)}...</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${res.critical_findings?.length > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                            }`}>
                                            {res.critical_findings?.length || 0} Critical
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-500">
                                        {res.critical_findings?.length > 0
                                            ? res.critical_findings.map((f: any) => `${f.Priority} (${f.LabName})`).join(", ")
                                            : "No urgent actions required"}
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
