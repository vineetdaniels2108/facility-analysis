"use client"
import { useState, useEffect } from "react"
import { Building2, Search, Database } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function FacilitiesPage() {
    const [facilities, setFacilities] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        const fetchFacilities = async () => {
            const { data, error } = await supabase
                .from('facilities')
                .select('*')
                .order('name');

            if (error) {
                console.error("Error fetching facilities:", error);
            } else {
                setFacilities(data || []);
            }
            setIsLoading(false);
        };

        fetchFacilities();
    }, [supabase]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-sm border border-indigo-200/50">
                    <Building2 className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Facilities Database</h1>
                    <p className="text-slate-500 text-sm">Review facilities automatically onboarded to the system via PointClickCare records</p>
                </div>
            </div>

            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <h2 className="text-lg font-bold text-slate-800">Supabase Table Sync ({facilities.length} active)</h2>
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search facilities..."
                                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-4 rounded-tl-xl">Facility ID</th>
                                <th className="px-6 py-4">Facility Name</th>
                                <th className="px-6 py-4">API Tenant Route</th>
                                <th className="px-6 py-4 rounded-tr-xl">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                        <Database className="w-6 h-6 animate-pulse mx-auto mb-2" />
                                        Querying Supabase Facilities Table...
                                    </td>
                                </tr>
                            )}
                            {!isLoading && facilities.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                        No facilities found attached to your account.
                                    </td>
                                </tr>
                            )}
                            {facilities.map((fac) => (
                                <tr key={fac.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{fac.id}</td>
                                    <td className="px-6 py-4 font-semibold text-slate-800">{fac.name}</td>
                                    <td className="px-6 py-4 text-slate-500 font-mono text-xs">/v1/tenant/{fac.id.split('-')[0]}</td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-md flex items-center gap-1 w-fit">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> Sync Active
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
