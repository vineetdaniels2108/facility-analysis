"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Building2, Users, ChevronRight, Loader2 } from "lucide-react"

interface Facility {
    name: string;
    patient_count: number;
}

export default function FacilitiesPage() {
    const [facilities, setFacilities] = useState<Facility[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        fetch('/api/facilities')
            .then(r => r.json())
            .then(d => {
                setFacilities(d.facilities ?? []);
                setIsLoading(false);
            })
            .catch(() => setIsLoading(false));
    }, []);

    const goToPatients = (facilityName: string) => {
        router.push(`/patients?facility=${encodeURIComponent(facilityName)}`);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-sm border border-indigo-200/50">
                    <Building2 className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Facilities</h1>
                    <p className="text-slate-500 text-sm">Select a facility to view its patients and live PointClickCare data</p>
                </div>
            </div>

            {isLoading && (
                <div className="flex items-center justify-center py-20 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Loading facilities...
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {facilities.map((fac) => (
                    <button
                        key={fac.name}
                        onClick={() => goToPatients(fac.name)}
                        className="group bg-white border border-slate-100 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all text-left"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-100 transition-colors">
                                <Building2 className="w-5 h-5 text-indigo-500" />
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors mt-1 flex-shrink-0" />
                        </div>
                        <div className="mt-4">
                            <h3 className="font-semibold text-slate-800 text-sm leading-snug">{fac.name}</h3>
                            <div className="flex items-center gap-1.5 mt-2">
                                <Users className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-xs text-slate-500">{fac.patient_count} patient{fac.patient_count !== 1 ? 's' : ''}</span>
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-100">
                            <span className="text-xs font-medium text-indigo-500 group-hover:text-indigo-600">
                                View Patients →
                            </span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
