"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type DayPickerProps } from "react-day-picker"
import { cn } from "@/lib/utils"

type CalendarProps = DayPickerProps & { buttonVariant?: "outline" | "ghost" }

function Calendar({ className, classNames, showOutsideDays = true, buttonVariant, ...props }: CalendarProps) {
  void buttonVariant
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col gap-5 md:flex-row", month: "space-y-4", month_caption: "relative flex h-10 items-center justify-center", caption_label: "text-sm font-semibold capitalize",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between", button_previous: "inline-flex size-9 items-center justify-center rounded-md border bg-background hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", button_next: "inline-flex size-9 items-center justify-center rounded-md border bg-background hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        month_grid: "w-full border-collapse space-y-1", weekdays: "flex", weekday: "w-10 rounded-md text-center text-xs font-normal text-muted-foreground", week: "mt-2 flex w-full", day: "relative size-10 p-0 text-center text-sm", day_button: "size-10 rounded-md font-normal hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35",
        selected: "bg-primary text-primary-foreground hover:bg-primary", range_start: "rounded-l-md bg-primary text-primary-foreground", range_middle: "rounded-none bg-accent text-accent-foreground", range_end: "rounded-r-md bg-primary text-primary-foreground", today: "border border-primary font-bold text-primary", outside: "text-muted-foreground opacity-40", disabled: "text-muted-foreground opacity-30", hidden: "invisible", ...classNames,
      }}
      components={{
        // react-day-picker supplies this typed navigation property.
        // eslint-disable-next-line react/prop-types
        Chevron: ({ orientation }) => orientation === "left" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />,
      }}
      {...props}
    />
  )
}

export { Calendar }
