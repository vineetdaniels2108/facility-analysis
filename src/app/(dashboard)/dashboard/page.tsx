import {
    Activity,
    Syringe,
    Droplet,
    ClipboardList,
    ArrowRight,
    Stethoscope,
    Users,
    Building2
} from "lucide-react"
import Link from "next/link"

const ANALYSIS_MODULES = [
    {
        id: "pdpm",
        title: "PDPM Analysis",
        description: "Review comprehensive Patient-Driven Payment Model scoring, NTA comorbidities, and reimbursements.",
        icon: ClipboardList,
        color: "bg-amber-500",
        gradient: "from-amber-500/20 to-amber-500/5",
        border: "border-amber-200/50"
    },
    {
        id: "infusion",
        title: "Infusion Analysis",
        description: "Monitor patients requiring infusion therapies, including specialized antibiotics and hydration.",
        icon: Syringe,
        color: "bg-blue-500",
        gradient: "from-blue-500/20 to-blue-500/5",
        border: "border-blue-200/50"
    },
    {
        id: "transfusion",
        title: "Transfusion Analysis",
        description: "Track hemoglobin trends and automatically identify candidates for blood transfusions.",
        icon: Droplet,
        color: "bg-red-500",
        gradient: "from-red-500/20 to-red-500/5",
        border: "border-red-200/50"
    },
    {
        id: "care-gap",
        title: "Patient Care Gaps & Next Steps",
        description: "AI-driven identification of missed diagnoses, overdue labs, and actionable care recommendations.",
        icon: Activity,
        color: "bg-primary-500",
        gradient: "from-primary-500/20 to-primary-500/5",
        border: "border-primary-200/50"
    },
    {
        id: "patients",
        title: "Patient Directory",
        description: "Explore the raw clinical data JSON payloads ingested from PointClickCare for all patients.",
        icon: Users,
        color: "bg-teal-500",
        gradient: "from-teal-500/20 to-teal-500/5",
        border: "border-teal-200/50"
    },
    {
        id: "facilities",
        title: "Facilities Database",
        description: "View automatically onboarded facilities and their respective PointClickCare integration statuses.",
        icon: Building2,
        color: "bg-indigo-500",
        gradient: "from-indigo-500/20 to-indigo-500/5",
        border: "border-indigo-200/50"
    }
]

export default function DashboardPage() {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Facility Overview</h1>
                    <p className="text-slate-500 mt-1">
                        Analyzing 142 complete patient records today. Data last synced 15 mins ago.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="px-4 py-2 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center gap-2">
                        <Users className="w-5 h-5 text-slate-400" />
                        <span className="font-semibold text-slate-700">142</span>
                        <span className="text-xs text-slate-500">Total Patients</span>
                    </div>
                    <button className="px-4 py-2 bg-primary-50 hover:bg-primary-100 text-primary-700 font-medium rounded-xl transition-colors border border-primary-200/50">
                        Export Report
                    </button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start gap-4 hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                        <Stethoscope className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-slate-500 text-sm font-medium">High Risk Patients</h3>
                        <div className="text-3xl font-bold text-slate-800 mt-1">24</div>
                        <p className="text-xs text-red-500 font-medium mt-1">↑ 3 from yesterday</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start gap-4 hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                        <ClipboardList className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-slate-500 text-sm font-medium">Pending Reviews</h3>
                        <div className="text-3xl font-bold text-slate-800 mt-1">12</div>
                        <p className="text-xs text-slate-400 mt-1">Requires physician sign-off</p>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-primary-500 to-primary-600 p-6 rounded-2xl shadow-md border border-primary-400 flex flex-col justify-between text-white hover:shadow-lg transition-all hover:-translate-y-1">
                    <div>
                        <h3 className="text-primary-100 text-sm font-medium">AI Processing Status</h3>
                        <div className="font-semibold text-lg mt-1 flex items-center gap-2">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                            </span>
                            All systems nominal
                        </div>
                    </div>
                    <button className="text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg w-fit mt-4 transition-colors font-medium backdrop-blur-sm">
                        View Analytics Logs
                    </button>
                </div>
            </div>

            {/* 4 Analysis Modules */}
            <div>
                <h2 className="text-xl font-bold text-slate-800 mb-6">AI Analysis Modules</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {ANALYSIS_MODULES.map((module) => (
                        <Link href={`/${module.id}`} key={module.id} className="block group">
                            <div
                                className={`relative overflow-hidden h-full bg-white p-6 rounded-3xl shadow-sm hover:shadow-xl transition-all border ${module.border} hover:-translate-y-1 flex flex-col`}
                            >
                                <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl ${module.gradient} rounded-full -translate-y-1/2 translate-x-1/2 opacity-50 pointer-events-none group-hover:scale-110 transition-transform duration-700`}></div>

                                <div className={`w-14 h-14 ${module.color} rounded-2xl flex items-center justify-center text-white mb-6 shadow-md shadow-slate-200`}>
                                    <module.icon className="w-7 h-7" />
                                </div>

                                <h3 className="text-xl font-bold text-slate-800 mb-2">{module.title}</h3>
                                <p className="text-slate-500 line-clamp-2 pr-8 flex-1 mb-6">
                                    {module.description}
                                </p>

                                <div className="flex items-center text-sm font-semibold text-slate-800 group-hover:text-primary-600 transition-colors mt-auto w-fit">
                                    Launch Module
                                    <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>

        </div>
    )
}
