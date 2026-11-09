import { dateInput, startOfDay } from "@/lib/format";

/** GET formu: başlangıç/bitiş tarihi ve şube seçimi */
export function DateFilter({
  from,
  to,
  branches,
  branchId,
}: {
  from: Date;
  to: Date;
  branches?: { id: string; name: string }[];
  branchId?: string | null;
}) {
  const end = new Date(to.getTime() - 864e5);
  return (
    <form className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label">Başlangıç</label>
        <input type="date" name="from" defaultValue={dateInput(from)} className="input" />
      </div>
      <div>
        <label className="label">Bitiş</label>
        <input type="date" name="to" defaultValue={dateInput(end)} className="input" />
      </div>
      {branches && (
        <div>
          <label className="label">Şube</label>
          <select name="branch" defaultValue={branchId ?? ""} className="input">
            {branches.length > 1 && <option value="">Tüm şubeler</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}
      <button className="btn-secondary">Uygula</button>
    </form>
  );
}

/** ?from=&to= parametrelerinden [from, to) aralığı (Türkiye saatiyle); varsayılan: bugün veya son N gün */
export function parseRange(sp: { from?: string; to?: string }, defaultDays = 1) {
  const today = dateInput(new Date());
  const to = new Date(startOfDay(sp.to || today).getTime() + 864e5);
  const from = sp.from ? startOfDay(sp.from) : new Date(startOfDay(today).getTime() - (defaultDays - 1) * 864e5);
  return { from, to };
}
