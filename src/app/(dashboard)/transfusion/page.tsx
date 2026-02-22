import { Droplet, AlertCircle } from "lucide-react"

export default function TransfusionPage() {
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

            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm flex flex-col items-center">
                <AlertCircle className="w-12 h-12 text-slate-300 mb-4" />
                <h3 className="text-lg font-semibold text-slate-700">Connecting to Python Backend</h3>
                <p className="text-slate-500 mt-2 max-w-md">
                    The Transfusion tracking engine will be integrated here, evaluating hematology reports against clinical intervention thresholds.
                </p>
                <button className="mt-6 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-md transition-all text-sm font-medium">
                    Trigger Manual Analysis Run
                </button>
            </div>
        </div>
    )
}
