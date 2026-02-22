import { Activity, AlertCircle } from "lucide-react"

export default function CareGapsPage() {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center shadow-sm border border-primary-200/50">
                    <Activity className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Care Gap Analysis</h1>
                    <p className="text-slate-500 text-sm">AI-driven identification of missed diagnoses and recommended next steps</p>
                </div>
            </div>

            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm flex flex-col items-center">
                <AlertCircle className="w-12 h-12 text-slate-300 mb-4" />
                <h3 className="text-lg font-semibold text-slate-700">Connecting to Python Backend</h3>
                <p className="text-slate-500 mt-2 max-w-md">
                    The universal AI insight engine will be integrated here, mapping progress notes against standardized care protocols.
                </p>
                <button className="mt-6 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-md transition-all text-sm font-medium">
                    Trigger Manual Analysis Run
                </button>
            </div>
        </div>
    )
}
