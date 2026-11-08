import { dateInput } from "@/lib/format";

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
  const end = new Date(to);
  end.setDate(end.getDate() - 1);
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

/** ?from=&to= parametrelerinden [from, to) aralığı; varsayılan: bugün */
export function parseRange(sp: { from?: string; to?: string }, defaultDays = 1) {
  const from = sp.from ? new Date(`${sp.from}T00:00:00`) : new Date();
  from.setHours(0, 0, 0, 0);
  if (!sp.from && defaultDays > 1) from.setDate(from.getDate() - (defaultDays - 1));
  const to = sp.to ? new Date(`${sp.to}T00:00:00`) : new Date();
  to.setHours(0, 0, 0, 0);
  to.setDate(to.getDate() + 1);
  return { from, to };
}
