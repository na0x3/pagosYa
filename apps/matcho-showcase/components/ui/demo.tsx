"use client"

import * as React from "react"
import { type DateRange } from "react-day-picker"
import { enUS, es } from "react-day-picker/locale"

import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card-shadcn"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const localizedStrings = {
  en: { title: "Schedule a discount", description: "Choose an active date range. Past dates are unavailable." },
  es: { title: "Programa un descuento", description: "Elige un rango vigente. Las fechas pasadas no están disponibles." },
} as const

function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function daysFrom(date: Date, amount: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + amount)
  return result
}

export default function Calendar12() {
  const today = React.useMemo(() => startOfToday(), [])
  const [locale, setLocale] = React.useState<keyof typeof localizedStrings>("es")
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>({ from: today, to: daysFrom(today, 7) })

  return (
    <Card className="w-fit max-w-full overflow-hidden">
      <CardHeader className="relative border-b pr-32">
        <CardTitle>{localizedStrings[locale].title}</CardTitle>
        <CardDescription>{localizedStrings[locale].description}</CardDescription>
        <Select value={locale} onValueChange={(value) => setLocale(value as keyof typeof localizedStrings)}>
          <SelectTrigger className="absolute right-4 top-4 w-[104px]" aria-label="Idioma del calendario"><SelectValue placeholder="Idioma" /></SelectTrigger>
          <SelectContent align="end"><SelectItem value="es">Español</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="overflow-x-auto pt-4">
        <Calendar mode="range" selected={dateRange} onSelect={setDateRange} defaultMonth={today} numberOfMonths={2} locale={locale === "es" ? es : enUS} disabled={{ before: today }} className="bg-transparent p-0" buttonVariant="outline" />
      </CardContent>
    </Card>
  )
}
