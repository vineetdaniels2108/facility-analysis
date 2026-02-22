import { Syringe, AlertCircle } from "lucide-react"
import { MOCK_INFUSION_CANDIDATES } from "@/lib/mockData"

export default function InfusionPage() {
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
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-slate-800">Infusion Candidates</h2>
                    <button className="px-4 py-2 bg-primary-50 hover:bg-primary-100 text-primary-700 font-medium rounded-xl transition-colors text-sm">
                        Scan Recent Labs
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-4 rounded-tl-xl">Patient ID</th>
                                <th className="px-6 py-4">Priority</th>
                                <th className="px-6 py-4">Recommendation</th>
                                <th className="px-6 py-4 rounded-tr-xl">Reasoning</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {MOCK_INFUSION_CANDIDATES.map((candidate, i) => (
                                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 font-semibold text-slate-700 whitespace-nowrap">{candidate.patientId}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${candidate.priority === 'High' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                            }`}>
                                            {candidate.priority}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-800 font-medium whitespace-nowrap block truncate max-w-[200px]">{candidate.recommendation}</td>
                                    <td className="px-6 py-4 text-slate-500 line-clamp-2">{candidate.reason}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
