"use client"

import { useState, useEffect, useCallback } from "react"
import { Users, UserPlus, Search, Trash2, Edit2, Shield, X, Check, Mail, Clock, UserCheck, Ban } from "lucide-react"

interface User {
    id: string
    email: string
    firstName: string
    lastName: string
    role: string
    facilityIds: number[]
    status: 'invited' | 'registered' | 'active' | 'disabled'
    createdAt: string
    lastSignIn: string | null
}

interface Facility {
    fac_id: number
    name: string
    active_count: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Mail }> = {
    invited: { label: 'Invited', color: 'bg-amber-100 text-amber-700', icon: Mail },
    registered: { label: 'Registered', color: 'bg-blue-100 text-blue-700', icon: Clock },
    active: { label: 'Active', color: 'bg-emerald-100 text-emerald-700', icon: UserCheck },
    disabled: { label: 'Disabled', color: 'bg-red-100 text-red-700', icon: Ban },
}

const ROLES = ['superadmin', 'admin', 'physician', 'nurse', 'user']

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([])
    const [facilities, setFacilities] = useState<Facility[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [roleFilter, setRoleFilter] = useState("all")
    const [showAddModal, setShowAddModal] = useState(false)
    const [editingUser, setEditingUser] = useState<User | null>(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState("")

    const fetchUsers = useCallback(async () => {
        try {
            const [usersRes, facRes] = await Promise.all([
                fetch('/api/admin/users'),
                fetch('/api/facilities?all=true'),
            ])
            const usersData = await usersRes.json()
            const facData = await facRes.json()
            setUsers(usersData.users ?? [])
            setFacilities(facData.facilities ?? [])
        } catch {
            setError('Failed to load users')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchUsers() }, [fetchUsers])

    const filtered = users.filter(u => {
        const term = searchTerm.toLowerCase()
        const matchesSearch = !term || u.email.toLowerCase().includes(term)
            || (u.firstName + ' ' + u.lastName).toLowerCase().includes(term)
        const matchesRole = roleFilter === 'all' || u.role === roleFilter
        return matchesSearch && matchesRole
    })

    const handleDelete = async (user: User) => {
        if (!confirm(`Delete ${user.email}? This cannot be undone.`)) return
        try {
            const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
            if (!res.ok) { const d = await res.json(); alert(d.error); return }
            setUsers(prev => prev.filter(u => u.id !== user.id))
        } catch { alert('Failed to delete user') }
    }

    const facilityName = (facId: number) =>
        facilities.find(f => f.fac_id === facId)?.name ?? `Facility ${facId}`

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                        <Users className="w-6 h-6 text-primary-500" />
                        User Management
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                        {users.length} user{users.length !== 1 ? 's' : ''} &middot; Manage access, roles, and facility assignments
                    </p>
                </div>
                <button
                    onClick={() => { setEditingUser(null); setShowAddModal(true) }}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-xl transition-all shadow-md shadow-primary-500/20 active:translate-y-0.5"
                >
                    <UserPlus className="w-4 h-4" /> Add New User
                </button>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row gap-4 justify-between items-center">
                <div className="relative w-full sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" placeholder="Search users by name or email..."
                        value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 bg-slate-50 hover:bg-white"
                    />
                </div>
                <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
                    className="border border-slate-200 text-sm rounded-xl px-3 py-2 bg-slate-50 hover:bg-white outline-none focus:border-primary-500 text-slate-600 cursor-pointer">
                    <option value="all">All Roles</option>
                    {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
            </div>

            {error && <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm">{error}</div>}

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-slate-400">Loading users...</div>
                ) : (
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
                                {filtered.map((user) => {
                                    const sc = STATUS_CONFIG[user.status] ?? STATUS_CONFIG.active
                                    const StatusIcon = sc.icon
                                    return (
                                        <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm">
                                                        {(user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? user.email[0])}
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-slate-800">
                                                            {user.firstName || user.lastName ? `${user.firstName} ${user.lastName}`.trim() : user.email}
                                                        </div>
                                                        <div className="text-slate-500 text-xs">{user.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-1.5">
                                                    {user.role === 'admin' && <Shield className="w-3.5 h-3.5 text-indigo-500" />}
                                                    <span className="text-slate-700 capitalize">{user.role}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {user.role === 'superadmin' ? (
                                                    <span className="text-xs text-purple-600 font-medium flex items-center gap-1"><Shield className="w-3 h-3" />All Facilities (Super Admin)</span>
                                                ) : user.role === 'admin' ? (
                                                    <span className="text-xs text-indigo-600 font-medium">All Facilities</span>
                                                ) : user.facilityIds.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {user.facilityIds.map(fid => (
                                                            <span key={fid} className="inline-block bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">
                                                                {facilityName(fid)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-400">None assigned</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${sc.color}`}>
                                                    <StatusIcon className="w-3 h-3" /> {sc.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button onClick={() => { setEditingUser(user); setShowAddModal(true) }}
                                                    className="p-2 text-slate-400 hover:text-primary-600 rounded-lg transition-colors">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDelete(user)}
                                                    className="p-2 text-slate-400 hover:text-red-600 rounded-lg transition-colors">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                                {filtered.length === 0 && (
                                    <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400">No users found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showAddModal && (
                <UserModal
                    user={editingUser}
                    facilities={facilities}
                    saving={saving}
                    onClose={() => { setShowAddModal(false); setEditingUser(null) }}
                    onSave={async (data) => {
                        setSaving(true)
                        try {
                            if (editingUser) {
                                const res = await fetch(`/api/admin/users/${editingUser.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(data),
                                })
                                if (!res.ok) { const d = await res.json(); alert(d.error); return }
                            } else {
                                const res = await fetch('/api/admin/users', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(data),
                                })
                                if (!res.ok) { const d = await res.json(); alert(d.error); return }
                            }
                            setShowAddModal(false)
                            setEditingUser(null)
                            fetchUsers()
                        } catch { alert('Failed to save') } finally { setSaving(false) }
                    }}
                />
            )}
        </div>
    )
}

function UserModal({ user, facilities, saving, onClose, onSave }: {
    user: User | null
    facilities: Facility[]
    saving: boolean
    onClose: () => void
    onSave: (data: { email?: string; firstName: string; lastName: string; role: string; facilityIds: number[]; password?: string }) => void
}) {
    const [email, setEmail] = useState(user?.email ?? '')
    const [firstName, setFirstName] = useState(user?.firstName ?? '')
    const [lastName, setLastName] = useState(user?.lastName ?? '')
    const [role, setRole] = useState(user?.role ?? 'user')
    const [facilityIds, setFacilityIds] = useState<number[]>(user?.facilityIds ?? [])
    const [password, setPassword] = useState('')

    const toggleFacility = (fid: number) => {
        setFacilityIds(prev => prev.includes(fid) ? prev.filter(f => f !== fid) : [...prev, fid])
    }

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800">{user ? 'Edit User' : 'Add New User'}</h2>
                    <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
                </div>
                <div className="p-5 space-y-4">
                    {!user && (
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Email *</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary-500" placeholder="user@example.com" />
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">First Name</label>
                            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Last Name</label>
                            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary-500" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
                        <select value={role} onChange={e => setRole(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary-500 cursor-pointer">
                            {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                        </select>
                    </div>
                    {!user && (
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Password (leave blank to send invite email)</label>
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary-500" placeholder="Optional" />
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-2">Facility Access</label>
                        {role === 'superadmin' ? (
                            <p className="text-xs text-purple-600 font-medium">Super admins have access to all facilities</p>
                        ) : role === 'admin' ? (
                            <p className="text-xs text-indigo-600">Admins have access to all facilities</p>
                        ) : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto border border-slate-100 rounded-xl p-2">
                                {facilities.map(f => (
                                    <label key={f.fac_id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                                        <input type="checkbox" checked={facilityIds.includes(f.fac_id)} onChange={() => toggleFacility(f.fac_id)}
                                            className="rounded border-slate-300 text-primary-500 focus:ring-primary-500" />
                                        <span className="text-sm text-slate-700">{f.name}</span>
                                        <span className="text-xs text-slate-400 ml-auto">{f.active_count} patients</span>
                                    </label>
                                ))}
                                {facilities.length === 0 && <p className="text-xs text-slate-400 p-2">No facilities available</p>}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
                    <button disabled={saving || (!user && !email)}
                        onClick={() => onSave({ ...(!user ? { email } : {}), firstName, lastName, role, facilityIds: (role === 'admin' || role === 'superadmin') ? [] : facilityIds, ...(!user && password ? { password } : {}) })}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-xl disabled:opacity-50">
                        <Check className="w-4 h-4" /> {saving ? 'Saving...' : user ? 'Save Changes' : 'Create User'}
                    </button>
                </div>
            </div>
        </div>
    )
}

