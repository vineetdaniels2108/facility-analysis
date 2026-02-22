import { TopNavbar } from "@/components/layout/TopNavbar"

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-slate-50/50">
            <TopNavbar />
            <main className="max-w-[1600px] mx-auto p-6 md:p-8">
                {children}
            </main>
        </div>
    )
}
