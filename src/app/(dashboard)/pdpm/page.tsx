"use client"
import { useState } from "react"
import { ClipboardList, AlertCircle, Loader2 } from "lucide-react"
import { MOCK_PDPM_RESULTS } from "@/lib/mockData"
import { submitPDPMAnalysis } from "@/lib/api/ai"

export default function PDPMPage() {
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleRunAnalysis = async () => {
        setIsAnalyzing(true);
        try {
            // Mock patient payload representing data fetched from PointClickCare
            const payload = {
                simplId: "TEST-PATIENT-001",
                conditions: [
                    { description: "Chronic Heart Failure" },
                    { description: "Diabetes Mellitus" }
                ],
                medications: [],
                labs: {},
                vitals: {},
                functional_score: 9,
                bims_score: 13,
                clinical_category: "Medical Management",
                has_depression_flag: true
            };

            const result = await submitPDPMAnalysis(payload);
            alert(`✅ Python AI Engine Success!\n\nPatient: ${result.patientId}\nNTA Points: ${result.components.NTA.total_score}\nNursing Class: ${result.components.Nursing.group}`);
        } catch (error) {
            console.error(error);
            alert("❌ Python AI Engine Failed to Connect. Make sure the FastAPI server is running on port 8000!");
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
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-slate-800">Recent PDPM Evaluations</h2>
                    <button
                        onClick={handleRunAnalysis}
                        disabled={isAnalyzing}
                        className="px-4 py-2 bg-primary-50 hover:bg-primary-100 text-primary-700 font-medium rounded-xl transition-colors text-sm flex items-center gap-2 disabled:opacity-50">
                        {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Run Full Analysis"}
                    </button>
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
                                <th className="px-6 py-4">NTA Group</th>
                                <th className="px-6 py-4 rounded-tr-xl">Total Score</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {MOCK_PDPM_RESULTS.map((result, i) => (
                                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 font-semibold text-slate-700">{result.patientId}</td>
                                    <td className="px-6 py-4 text-slate-600">{result.ptScore}</td>
                                    <td className="px-6 py-4 text-slate-600">{result.otScore}</td>
                                    <td className="px-6 py-4 text-slate-600">{result.slpScore}</td>
                                    <td className="px-6 py-4 text-slate-600">{result.nursingScore}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${result.ntaScore === 'NC' || result.ntaScore === 'NA' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                                            }`}>
                                            {result.ntaScore}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-bold text-slate-800">{result.totalPoints} pts</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
