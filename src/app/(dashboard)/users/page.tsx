"use client"

import { useState } from "react"
import { Users, UserPlus, Search, MoreVertical, Trash2, Edit2, Shield } from "lucide-react"

const MOCK_USERS = [
    { id: 1, name: "Dr. Sarah Jenkins", email: "s.jenkins@simpl.care", role: "Admin", facility: "All Settings", status: "Active" },
    { id: 2, name: "James Carter", email: "j.carter@simpl.care", role: "Physician", facility: "Simpl Psychiatry Center", status: "Active" },
    { id: 3, name: "Amanda Lewis", email: "a.lewis@simpl.care", role: "Nurse", facility: "Peak Psychology Clinic", status: "Inactive" },
    { id: 4, name: "Dr. Robert Chen", email: "r.chen@simpl.care", role: "Physician", facility: "Marine Creek Treatment", status: "Active" },
]

export default function UsersPage() {
    const [searchTerm, setSearchTerm] = useState("")

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                        <Users className="w-6 h-6 text-primary-500" />
                        User Management
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Manage platform access, roles, and facility assignments.</p>
                </div>

                <button className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-xl transition-all shadow-md shadow-primary-500/20 active:translate-y-0.5">
                    <UserPlus className="w-4 h-4" />
                    Add New User
                </button>
            </div>

            {/* Filters & Search */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row gap-4 justify-between items-center">
                <div className="relative w-full sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search users by name or email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors bg-slate-50 hover:bg-white"
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <select className="border border-slate-200 text-sm rounded-xl px-3 py-2 bg-slate-50 hover:bg-white outline-none focus:border-primary-500 text-slate-600 w-full sm:w-auto cursor-pointer">
                        <option value="all">All Roles</option>
                        <option value="admin">Admin</option>
                        <option value="physician">Physician</option>
                        <option value="nurse">Nurse</option>
                    </select>
                    <select className="border border-slate-200 text-sm rounded-xl px-3 py-2 bg-slate-50 hover:bg-white outline-none focus:border-primary-500 text-slate-600 w-full sm:w-auto cursor-pointer">
                        <option value="all">All Facilities</option>
                        <option value="psychiatry">Simpl Psychiatry</option>
                        <option value="psychology">Peak Psychology</option>
                    </select>
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-4">User</th>
                                <th className="px-6 py-4">Role</th>
                                <th className="px-6 py-4">Facility Access</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {MOCK_USERS.map((user) => (
                                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm">
                                                {user.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                                            </div>
                                            <div>
                                                <div className="font-semibold text-slate-800">{user.name}</div>
                                                <div className="text-slate-500 text-xs">{user.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5">
                                            {user.role === 'Admin' && <Shield className="w-3.5 h-3.5 text-indigo-500" />}
                                            <span className="text-slate-700">{user.role}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">{user.facility}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${user.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                                            }`}>
                                            {user.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="p-2 text-slate-400 hover:text-primary-600 rounded-lg transition-colors">
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button className="p-2 text-slate-400 hover:text-red-600 rounded-lg transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <button className="p-2 text-slate-400 hover:text-slate-600 rounded-lg transition-colors">
                                            <MoreVertical className="w-4 h-4" />
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
