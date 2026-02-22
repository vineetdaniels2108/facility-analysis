"use client"
import { useState, useEffect } from "react"
import { Users, Search, Activity, FileJson } from "lucide-react"

interface PatientSummary {
    simpl_id: string;
    first_name: string;
    last_name: string;
    facility: string;
}

export default function PatientsPage() {
    const [patients, setPatients] = useState<PatientSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetch("/api/patients")
            .then(res => res.json())
            .then(data => {
                if (data.patients) {
                    setPatients(data.patients);
                }
                setIsLoading(false);
            })
            .catch((err) => {
                console.error(err);
                setIsLoading(false);
            });
    }, []);

    const handleViewRawData = async (simplId: string) => {
        // Open the raw JSON payload in a new tab for debugging/viewing 
        window.open(`/api/patients/${simplId}/sync`, '_blank');
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-600 flex items-center justify-center shadow-sm border border-teal-200/50">
                    <Users className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Patient Directory</h1>
                    <p className="text-slate-500 text-sm">Browse the live clinical records securely ingested from PointClickCare</p>
                </div>
            </div>

            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <h2 className="text-lg font-bold text-slate-800">Local JSON Cache ({patients.length} loaded)</h2>
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search patients..."
                                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                            />
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-4 rounded-tl-xl">Patient ID</th>
                                <th className="px-6 py-4">Name</th>
                                <th className="px-6 py-4">Facility</th>
                                <th className="px-6 py-4 flex justify-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                        <Activity className="w-6 h-6 animate-pulse mx-auto mb-2" />
                                        Loading patient data from mock API...
                                    </td>
                                </tr>
                            )}
                            {!isLoading && patients.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                        No patients found. Ensure the Python extractor script has run.
                                    </td>
                                </tr>
                            )}
                            {patients.map((patient) => (
                                <tr key={patient.simpl_id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{patient.simpl_id}</td>
                                    <td className="px-6 py-4 font-semibold text-slate-800">
                                        {patient.last_name}, {patient.first_name}
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">{patient.facility}</td>
                                    <td className="px-6 py-4 flex justify-end">
                                        <button
                                            onClick={() => handleViewRawData(patient.simpl_id)}
                                            className="px-3 py-1.5 flex items-center gap-2 text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors font-medium">
                                            <FileJson className="w-4 h-4" /> View Raw Source JSON
                                        </button>
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
