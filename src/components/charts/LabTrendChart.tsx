"use client"

import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from "recharts"

export default function LabTrendChart({ name, history, refRange }: {
    name: string;
    history: Array<{ date: string; value: number }>;
    refRange?: string;
}) {
    const data = (history ?? [])
        .filter(h => h.date && h.value != null)
        .map(h => ({ date: (h.date ?? '').slice(5), value: h.value, fullDate: h.date ?? '' }))

    if (data.length === 0) return null

    let refLow: number | undefined, refHigh: number | undefined
    if (refRange) {
        const m = refRange.match(/([\d.]+)\s*[-–]\s*([\d.]+)/)
        if (m) { refLow = parseFloat(m[1]); refHigh = parseFloat(m[2]) }
    }

    return (
        <div className="bg-slate-50/80 border border-slate-100 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-semibold text-slate-600">{name}</p>
                {refRange && <p className="text-[9px] text-slate-400">{refRange}</p>}
            </div>
            <ResponsiveContainer width="100%" height={90}>
                <LineChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 8 }} />
                    <YAxis tick={{ fontSize: 8 }} width={30} domain={["auto", "auto"]} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <RechartsTooltip contentStyle={{ fontSize: 10, padding: '4px 8px' }} formatter={(val: any) => [String(val ?? ''), name]} labelFormatter={(_l: any, p: any) => p?.[0]?.payload?.fullDate ?? String(_l ?? '')} />
                    {refLow !== undefined && <ReferenceLine y={refLow} stroke="#94a3b8" strokeDasharray="3 3" />}
                    {refHigh !== undefined && <ReferenceLine y={refHigh} stroke="#94a3b8" strokeDasharray="3 3" />}
                    <Line type="monotone" dataKey="value" stroke="#0d9488" strokeWidth={1.5} dot={{ r: 1.5 }} activeDot={{ r: 3 }} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}
