"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, Loader2, Users } from "lucide-react"

interface Facility {
    name: string
    patient_count: number
}

export default function DashboardPage() {
    const router = useRouter()
    const [facilities, setFacilities] = useState<Facility[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch('/api/facilities')
            .then(r => r.json())
            .then(d => {
                setFacilities(d.facilities ?? [])
                setLoading(false)
            })
            .catch(() => setLoading(false))
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading facilities...
            </div>
        )
    }

    return (
        <div className="max-w-3xl mx-auto py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-10">
                <div className="w-16 h-16 rounded-2xl bg-teal-100 text-teal-600 flex items-center justify-center mx-auto mb-4 shadow-sm border border-teal-200/50">
                    <Building2 className="w-8 h-8" />
                </div>
                <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Select a Facility</h1>
                <p className="text-slate-500 mt-2">Choose a facility to view patients and run clinical analysis.</p>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {facilities.map(f => (
                    <button
                        key={f.name}
                        onClick={() => router.push(`/patients?facility=${encodeURIComponent(f.name)}`)}
                        className="flex items-center justify-between bg-white border border-slate-200 hover:border-teal-400 hover:shadow-md rounded-2xl px-6 py-5 transition-all group text-left"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center group-hover:bg-teal-100 transition-colors">
                                <Building2 className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="font-semibold text-slate-800 group-hover:text-teal-700 transition-colors">{f.name}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-slate-500">
                            <Users className="w-4 h-4" />
                            <span className="font-medium">{f.patient_count}</span>
                            <span className="text-slate-400">patients</span>
                        </div>
                    </button>
                ))}

                {facilities.length === 0 && (
                    <div className="text-center py-12 text-slate-400">
                        <p>No facilities found. Check your data source.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
