"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { Building2, ChevronDown, User, LogOut, Bell, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

interface Facility {
    name: string;
    patient_count: number;
}

function FacilitySelector() {
    const [facilities, setFacilities] = useState<Facility[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
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

    const selectFacility = useCallback((name: string) => {
        setIsOpen(false);
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
                    <span className="text-xs font-semibold text-slate-700 leading-tight max-w-[160px] truncate">
                        {activeFacility?.name ?? (loading ? 'Loading...' : 'Select Facility')}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">
                        {activeFacility ? `${activeFacility.patient_count} patients` : 'No facility selected'}
                    </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl shadow-slate-200/50 border border-slate-100 py-2 top-full z-50">
                        <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Select Facility
                        </div>
                        <div className="max-h-72 overflow-y-auto">
                            {loading && (
                                <div className="px-4 py-3 text-sm text-slate-400 flex items-center gap-2">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading facilities...
                                </div>
                            )}
                            {!loading && facilities.length === 0 && (
                                <div className="px-4 py-3 text-sm text-slate-400">No facilities found.</div>
                            )}
                            {facilities.map(f => {
                                const isActive = activeFacility?.name === f.name;
                                return (
                                    <button
                                        key={f.name}
                                        onClick={() => selectFacility(f.name)}
                                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between gap-2 ${isActive ? 'bg-primary-50/60 text-primary-700 font-medium' : 'text-slate-700'}`}
                                    >
                                        <span className="truncate">{f.name}</span>
                                        <span className="text-xs text-slate-400 flex-shrink-0">{f.patient_count}p</span>
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

                    <button className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors relative" title="Notifications">
                        <Bell className="w-4 h-4" />
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                    </button>

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
