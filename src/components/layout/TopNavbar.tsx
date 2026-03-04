"use client"

import { useState, useEffect, useCallback, Suspense, useRef } from "react"
import { Building2, ChevronDown, User, LogOut, Bell, Loader2, AlertTriangle, Droplets, FlaskConical, Syringe, Utensils, Apple, Settings } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

interface Facility {
    fac_id: number;
    name: string;
    active_count: number;
}

function FacilitySelector() {
    const [facilities, setFacilities] = useState<Facility[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const router = useRouter();
    const searchParams = useSearchParams();
    const activeFacilityName = searchParams.get('facility') ?? '';

    useEffect(() => {
        fetch('/api/facilities')
            .then(r => r.json())
            .then(d => {
                setFacilities(d.facilities ?? []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const activeFacility = facilities.find(f => f.name === activeFacilityName) ?? facilities[0] ?? null;

    const filtered = facilities.filter(f =>
        !search || f.name.toLowerCase().includes(search.toLowerCase())
    );

    const selectFacility = useCallback((name: string) => {
        setIsOpen(false);
        setSearch('');
        router.push(`/patients?facility=${encodeURIComponent(name)}`);
    }, [router]);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(o => !o)}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 rounded-xl transition-colors"
            >
                <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 flex-shrink-0">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                </div>
                <div className="flex-col items-start hidden sm:flex">
                    <span className="text-xs font-semibold text-slate-700 leading-tight max-w-[180px] truncate">
                        {activeFacility?.name ?? (loading ? 'Loading...' : 'Select Facility')}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">
                        {activeFacility ? `${activeFacility.active_count} active patients` : 'No facility selected'}
                    </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => { setIsOpen(false); setSearch(''); }} />
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl shadow-slate-200/50 border border-slate-100 top-full z-50 overflow-hidden">
                        <div className="px-3 pt-3 pb-2">
                            <input
                                type="text"
                                placeholder="Search facilities..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                autoFocus
                                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary-400 bg-slate-50"
                            />
                        </div>
                        <div className="max-h-72 overflow-y-auto">
                            {loading && (
                                <div className="px-4 py-3 text-sm text-slate-400 flex items-center gap-2">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading facilities...
                                </div>
                            )}
                            {!loading && filtered.length === 0 && (
                                <div className="px-4 py-3 text-sm text-slate-400">No facilities found.</div>
                            )}
                            {filtered.map(f => {
                                const isActive = activeFacility?.name === f.name;
                                return (
                                    <button
                                        key={f.fac_id}
                                        onClick={() => selectFacility(f.name)}
                                        className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-2 ${isActive ? 'bg-primary-50/60' : ''}`}
                                    >
                                        <div className="min-w-0">
                                            <div className={`text-sm truncate ${isActive ? 'text-primary-700 font-medium' : 'text-slate-700'}`}>{f.name}</div>
                                        </div>
                                        <span className="text-[10px] text-slate-400 flex-shrink-0 whitespace-nowrap">{f.active_count} active</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

const TYPE_ICON: Record<string, React.ReactNode> = {
    infusion: <Droplets className="w-3 h-3 text-blue-500" />,
    transfusion: <FlaskConical className="w-3 h-3 text-rose-500" />,
    foley_risk: <Syringe className="w-3 h-3 text-purple-500" />,
    gtube_risk: <Utensils className="w-3 h-3 text-orange-500" />,
    mtn_risk: <Apple className="w-3 h-3 text-lime-600" />,
}

function NotificationBell() {
    const [open, setOpen] = useState(false)
    const [notifications, setNotifications] = useState<Array<{
        id: string; patientName: string; facilityName: string;
        type: string; severity: string; message: string; time: string;
    }>>([])
    const [unread, setUnread] = useState(0)
    const [loading, setLoading] = useState(true)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        fetch('/api/notifications')
            .then(r => r.json())
            .then(d => { setNotifications(d.notifications ?? []); setUnread(d.unread ?? 0); setLoading(false); })
            .catch(() => setLoading(false))
    }, [])

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        if (open) document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [open])

    const fmtFac = (name: string) => name.replace("Rehabilitation and Healthcare", "Rehab").replace(" Center", "")

    return (
        <div className="relative" ref={ref}>
            <button onClick={() => setOpen(v => !v)}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors relative"
                title="Notifications">
                <Bell className="w-4 h-4" />
                {unread > 0 && (
                    <span className="absolute top-1 right-1 min-w-[14px] h-[14px] flex items-center justify-center bg-red-500 text-white text-[8px] font-bold rounded-full border-2 border-white px-0.5">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-2xl shadow-2xl shadow-slate-200/80 border border-slate-100 z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-bold text-slate-800">Alerts</p>
                            <p className="text-[10px] text-slate-400">Critical and high risk detected in last 24h</p>
                        </div>
                        {unread > 0 && <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded-full border border-red-100">{unread} new</span>}
                    </div>
                    <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
                        {loading && <div className="py-6 text-center text-slate-400 text-xs"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />Loading...</div>}
                        {!loading && notifications.length === 0 && <div className="py-8 text-center text-sm text-slate-400">No new alerts</div>}
                        {notifications.map(n => (
                            <div key={n.id} className="px-4 py-3 hover:bg-slate-50/60 transition-colors">
                                <div className="flex items-start gap-2.5">
                                    <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${n.severity === 'critical' ? 'bg-red-100' : 'bg-amber-100'}`}>
                                        {TYPE_ICON[n.type] ?? <AlertTriangle className="w-3 h-3 text-red-500" />}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs font-bold text-slate-800 truncate">{n.patientName}</p>
                                            <span className={`shrink-0 px-1 py-0.5 text-[8px] font-bold rounded ${n.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{n.severity.toUpperCase()}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-400">{fmtFac(n.facilityName)}</p>
                                        <p className="text-[10px] text-slate-600 mt-0.5 leading-relaxed line-clamp-2">{n.message}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {notifications.length > 0 && (
                        <div className="px-4 py-2.5 border-t border-slate-100 text-center">
                            <p className="text-[10px] text-slate-400">Alerts refresh after each nightly sync</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function NavbarLogout() {
    const router = useRouter();
    const supabase = createClient();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
    };

    return (
        <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
            title="Sign out"
        >
            <LogOut className="w-4 h-4" />
        </button>
    );
}

export function TopNavbar() {
    return (
        <header className="sticky top-0 z-50 w-full border-b border-black/5 bg-white/70 backdrop-blur-md">
            <div className="flex h-16 items-center px-6 justify-between max-w-[1600px] mx-auto">

                {/* Left: Brand */}
                <Link href="/dashboard" className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center text-white font-bold">
                        S
                    </div>
                    <span className="font-semibold text-xl tracking-tight text-slate-800">Simpl AI</span>
                </Link>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    <Link href="/users" className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors" title="Users">
                        <User className="w-4 h-4" />
                    </Link>
                    <Link href="/settings" className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors" title="Settings">
                        <Settings className="w-4 h-4" />
                    </Link>

                    <NotificationBell />

                    <div className="h-6 w-px bg-slate-200 mx-1" />

                    {/* Facility Dropdown */}
                    <Suspense fallback={
                        <div className="flex items-center gap-2 px-3 py-1.5">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                            </div>
                        </div>
                    }>
                        <FacilitySelector />
                    </Suspense>

                    <div className="h-6 w-px bg-slate-200 mx-1" />

                    <NavbarLogout />
                </div>
            </div>
        </header>
    );
}
