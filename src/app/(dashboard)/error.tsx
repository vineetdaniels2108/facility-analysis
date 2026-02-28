"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error("[Dashboard Error]", error)
    }, [error])

    return (
        <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
            <AlertTriangle className="w-10 h-10 text-red-500" />
            <h2 className="text-xl font-bold text-slate-800">Something went wrong</h2>
            <p className="text-sm text-slate-500 max-w-md">{error.message}</p>
            {error.digest && (
                <p className="text-xs text-slate-400 font-mono">Digest: {error.digest}</p>
            )}
            <pre className="text-[10px] text-left bg-slate-100 p-4 rounded-lg max-w-xl overflow-auto max-h-40 text-slate-600">
                {error.stack}
            </pre>
            <button
                onClick={reset}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
            >
                Try again
            </button>
        </div>
    )
}
