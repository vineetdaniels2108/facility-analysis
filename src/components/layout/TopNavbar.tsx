"use client"

import { useState } from "react"
import { Building2, ChevronDown, User, LogOut, Search, Bell } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

const MOCK_FACILITIES = [
    { id: "1", name: "Simpl Psychiatry Center", type: "Psychiatry" },
    { id: "2", name: "Peak Psychology Clinic", type: "Psychology" },
    { id: "3", name: "Marine Creek Treatment", type: "Rehab" },
]

export function TopNavbar() {
    const [activeFacility, setActiveFacility] = useState(MOCK_FACILITIES[0])
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push("/login")
        router.refresh()
    }

    return (
        <header className="sticky top-0 z-50 w-full border-b border-black/5 bg-white/70 backdrop-blur-md">
            <div className="flex h-16 items-center px-6 justify-between max-w-[1600px] mx-auto">

                {/* Left: Brand */}
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center text-white font-bold cursor-pointer">
                        S
                    </div>
                    <span className="font-semibold text-xl tracking-tight text-slate-800">Simpl AI</span>
                </div>

                {/* Middle: Search (Optional) */}
                <div className="hidden md:flex items-center flex-1 max-w-md mx-8 relative">
                    <Search className="w-4 h-4 absolute left-3 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search patients, notes..."
                        className="w-full bg-slate-100/50 hover:bg-slate-100 focus:bg-white border-transparent focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 rounded-full py-2 pl-10 pr-4 text-sm outline-none transition-all"
                    />
                </div>

                {/* Right: Actions & Facility Switcher */}
                <div className="flex items-center gap-4">

                    <Link href="/users" className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors relative group">
                        <User className="w-5 h-5 group-hover:text-primary-600" />
                    </Link>

                    <button className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors relative">
                        <Bell className="w-5 h-5" />
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                    </button>

                    <div className="h-6 w-px bg-slate-200 mx-1"></div>

                    {/* Facility Switcher */}
                    <div className="relative">
                        <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 rounded-xl transition-colors group"
                        >
                            <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-primary-600">
                                <Building2 className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col items-start px-1 hidden sm:flex">
                                <span className="text-xs font-semibold text-slate-700 leading-tight">
                                    {activeFacility.name}
                                </span>
                                <span className="text-[10px] text-slate-500 font-medium">
                                    {activeFacility.type}
                                </span>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isDropdownOpen && (
                            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl shadow-slate-200/50 border border-slate-100 py-2 top-full z-50">
                                <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                    Select Facility
                                </div>
                                {MOCK_FACILITIES.map(facility => (
                                    <button
                                        key={facility.id}
                                        onClick={() => {
                                            setActiveFacility(facility)
                                            setIsDropdownOpen(false)
                                        }}
                                        className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between ${activeFacility.id === facility.id ? 'bg-primary-50/50 text-primary-700 font-medium' : 'text-slate-700'}`}
                                    >
                                        <span>{facility.name}</span>
                                        {activeFacility.id === facility.id && (
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary-500"></div>
                                        )}
                                    </button>
                                ))}
                                <div className="h-px bg-slate-100 my-2"></div>
                                <button
                                    onClick={handleLogout}
                                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Sign Out
                                </button>
                            </div>
                        )}

                        {/* Invisible overlay to close dropdown */}
                        {isDropdownOpen && (
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => setIsDropdownOpen(false)}
                            ></div>
                        )}
                    </div>

                </div>
            </div>
        </header>
    )
}
