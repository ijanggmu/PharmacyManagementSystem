import { AlertTriangle, BadgeCheck, CheckCircle2, ScanLine, ShieldCheck } from "lucide-react"

/**
 * The hero's illustration: a counter screen and the thermal receipt it prints, drawn from the real POS and
 * invoice layout (Bikram Sambat date, VAT split, amount in words). Decorative; the page copy carries the
 * meaning, so the whole figure is hidden from assistive technology.
 */
export function HeroCounter() {
  return (
    <div className="relative mx-auto w-full max-w-[34rem]" aria-hidden>
      {/* Till */}
      <div className="relative z-10 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)] sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Point of sale · Main Branch</p>
            <p className="mt-0.5 font-display text-sm font-semibold text-slate-900">Current sale</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Drawer open
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50/50 px-3 py-2 text-xs text-slate-600">
          <ScanLine className="size-4 text-teal-700" />
          <span className="font-mono text-slate-800">8901234567890</span>
          <span className="ml-auto rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 ring-1 ring-teal-200">
            Added
          </span>
        </div>

        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {[
            { name: "Paracetamol 500 mg", meta: "Tablet · Batch PC2401 · Exp Oct 2028", qty: "10 × 2.00", amount: "20.00" },
            { name: "Amoxicillin 500 mg", meta: "Capsule · Rx-7 linked", qty: "21 × 12.00", amount: "252.00", rx: true },
            { name: "ORS sachet", meta: "Sachet · VAT exempt", qty: "3 × 15.00", amount: "45.00" },
          ].map((line) => (
            <li key={line.name} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate font-medium text-slate-900">
                  {line.name}
                  {line.rx && (
                    <span className="rounded bg-amber-50 px-1 py-px text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                      Rx
                    </span>
                  )}
                </p>
                <p className="truncate text-[11px] text-slate-500">{line.meta}</p>
                {line.rx && (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    Allergy match: penicillin. Pharmacist confirmed.
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <p className="font-medium text-slate-900">रू{line.amount}</p>
                <p className="text-[11px] text-slate-500">{line.qty}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-900 px-4 py-3 text-white">
          <span className="text-sm text-slate-300">Total</span>
          <span className="font-display text-xl font-bold tabular-nums">रू317.00</span>
        </div>
      </div>

      {/* Day closed */}
      <div className="absolute -top-5 right-6 hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 shadow-sm sm:flex">
        <CheckCircle2 className="size-3.5 text-emerald-600" />
        Z-out balanced · रू0.00 variance
      </div>

      {/* Printed receipt, hanging from the till, beside what the day's close looks like */}
      <div className="-mt-2 flex items-start justify-between gap-4 px-2">
        <div className="mt-10 hidden flex-col gap-2 sm:flex">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 shadow-sm">
            <ShieldCheck className="size-3.5 text-teal-700" />
            IRD-ready invoice
          </span>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 shadow-sm">
            <BadgeCheck className="size-3.5 text-teal-700" />
            Earliest expiry picked first
          </span>
        </div>
        <div className="relative ml-auto w-56 rotate-[2deg] rounded-b-md border border-t-0 border-slate-200 bg-white px-4 pb-4 pt-3 font-mono text-[10px] leading-relaxed text-slate-700 shadow-[0_18px_40px_-22px_rgba(15,23,42,0.45)]">
          <p className="text-center text-[11px] font-bold text-slate-900">Demo Pharmacy</p>
          <p className="text-center text-slate-500">Teku, Kathmandu</p>
          <p className="mt-1 text-center font-bold tracking-widest text-slate-900">TAX INVOICE</p>
          <div className="my-2 border-t border-dashed border-slate-300" />
          <div className="flex justify-between"><span>Date (BS)</span><span>29 Ashwin 2083</span></div>
          <div className="flex justify-between"><span>Invoice</span><span>MAIN-2083/84-00061</span></div>
          <div className="my-2 border-t border-dashed border-slate-300" />
          <div className="flex justify-between"><span>Taxable</span><span className="tabular-nums">17.70</span></div>
          <div className="flex justify-between"><span>VAT 13%</span><span className="tabular-nums">2.30</span></div>
          <div className="flex justify-between"><span>Exempt</span><span className="tabular-nums">297.00</span></div>
          <div className="mt-1 flex justify-between font-bold text-slate-900"><span>Grand total</span><span className="tabular-nums">317.00</span></div>
          <p className="mt-1 italic text-slate-500">Rupees Three Hundred Seventeen Only</p>
        </div>
      </div>
    </div>
  )
}
