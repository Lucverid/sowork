export const DEFAULT_SCHEDULE_RULES = {
  maleNames: ["Agis", "Ruhimat", "Tegar"],
  femaleNames: ["Nabila", "Mirya", "Cahya"],
  offDays: {
    Senin: ["Tegar", "Nabila"],
    Selasa: ["Ruhimat"],
    Rabu: ["Mirya"],
    Kamis: ["Cahya"],
    Jumat: ["Agis"],
    Sabtu: [],
    Minggu: []
  },
  version: 1
};

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const FORMATIONS = {
  Senin: { S1: 2, Middle: 0, S2: 2 },
  Selasa: { S1: 2, Middle: 1, S2: 2 },
  Rabu: { S1: 2, Middle: 1, S2: 2 },
  Kamis: { S1: 2, Middle: 1, S2: 2 },
  Jumat: { S1: 2, Middle: 1, S2: 2 },
  Sabtu: { S1: 2, Middle: 1, S2: 3 },
  Minggu: { S1: 2, Middle: 1, S2: 3 }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeRules(input = {}) {
  const base = clone(DEFAULT_SCHEDULE_RULES);
  const maleNames = Array.isArray(input.maleNames) ? input.maleNames : base.maleNames;
  const femaleNames = Array.isArray(input.femaleNames) ? input.femaleNames : base.femaleNames;
  const offDays = { ...base.offDays, ...(input.offDays || {}) };
  for (const day of DAY_NAMES) {
    if (!Array.isArray(offDays[day])) offDays[day] = [];
  }
  return {
    maleNames: cleanNames(maleNames),
    femaleNames: cleanNames(femaleNames),
    offDays,
    version: Number(input.version || 1)
  };
}

export function cleanNames(value) {
  const arr = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(arr.map(x => String(x).trim()).filter(Boolean))];
}

export function periodForMonth(year, month, includeCarryover = false) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) throw new Error("Bulan/tahun tidak valid.");
  const end = new Date(y, m - 1, 25);
  let start = new Date(y, m - 1, 1);
  if (includeCarryover) start = new Date(y, m - 2, 26);
  return { start, end };
}

export function validateRules(rulesInput) {
  const rules = normalizeRules(rulesInput);
  const errors = [];
  const warnings = [];
  const all = [...rules.maleNames, ...rules.femaleNames];
  const duplicates = all.filter((name, i) => all.indexOf(name) !== i);

  if (duplicates.length) errors.push(`Nama crew duplikat: ${[...new Set(duplicates)].join(", ")}.`);
  if (all.length !== 6) warnings.push(`Formasi sekarang dirancang untuk 6 crew; saat ini ada ${all.length}.`);
  if (!rules.maleNames.length) errors.push("Minimal harus ada 1 crew pria untuk aturan S2.");

  const expectedOff = { Senin: 2, Selasa: 1, Rabu: 1, Kamis: 1, Jumat: 1, Sabtu: 0, Minggu: 0 };
  for (const [day, expected] of Object.entries(expectedOff)) {
    const actual = rules.offDays[day]?.length || 0;
    if (actual !== expected) errors.push(`${day}: perlu ${expected} crew libur agar formasi pas, sekarang ${actual}.`);
    for (const name of rules.offDays[day] || []) {
      if (!all.includes(name)) errors.push(`${day}: crew libur “${name}” tidak ada di daftar crew.`);
    }
  }

  const fridayOff = rules.offDays.Jumat || [];
  if (fridayOff.some(name => rules.femaleNames.includes(name))) {
    errors.push("Jumat: crew yang libur harus pria supaya 2 S1 + 1 Middle bisa diisi wanita dan pria yang masuk tetap S2.");
  }

  const offCountByCrew = Object.fromEntries(all.map(n => [n, 0]));
  Object.values(rules.offDays).flat().forEach(name => {
    if (name in offCountByCrew) offCountByCrew[name]++;
  });
  const notExactlyOne = Object.entries(offCountByCrew).filter(([, count]) => count !== 1);
  if (notExactlyOne.length) warnings.push(`Rotasi libur idealnya 1 hari/crew per minggu: ${notExactlyOne.map(([n,c]) => `${n}=${c}`).join(", ")}.`);

  return { rules, errors, warnings };
}

export function generateSchedule({ year, month, includeCarryover = false, rules: rulesInput }) {
  const { rules, errors, warnings } = validateRules(rulesInput);
  if (errors.length) return { entries: [], errors, warnings, summary: null, range: null };

  const { start, end } = periodForMonth(year, month, includeCarryover);
  const people = [
    ...rules.maleNames.map(name => ({ name, gender: "Pria" })),
    ...rules.femaleNames.map(name => ({ name, gender: "Wanita" }))
  ];
  const genderByName = Object.fromEntries(people.map(p => [p.name, p.gender]));
  const counts = Object.fromEntries(people.map(p => [p.name, { S1: 0, Middle: 0, S2: 0, Libur: 0, total: 0 }]));
  const roleCounts = Object.fromEntries(people.map(p => [p.name, { Kasir: 0, Bar: 0, "Kitchen - Bar": 0 }]));
  const lastShift = Object.fromEntries(people.map(p => [p.name, null]));
  const lastRole = Object.fromEntries(people.map(p => [p.name, null]));
  const entries = [];

  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = new Date(cursor);
    const dateKey = localDateKey(date);
    const day = DAY_NAMES[date.getDay()];
    const formation = FORMATIONS[day];
    const offNames = new Set(rules.offDays[day] || []);
    const available = people.map(p => p.name).filter(name => !offNames.has(name));
    const assigned = new Map();

    for (const name of offNames) {
      assigned.set(name, "Libur");
      if (counts[name]) counts[name].Libur++;
    }

    const pick = (candidates, shift, extraPenalty = () => 0) => {
      const sorted = candidates.slice().sort((a, b) => {
        const scoreA = counts[a][shift] * 12 + counts[a].total * 0.6 + (lastShift[a] === shift ? 4 : 0) + extraPenalty(a);
        const scoreB = counts[b][shift] * 12 + counts[b].total * 0.6 + (lastShift[b] === shift ? 4 : 0) + extraPenalty(b);
        return scoreA - scoreB || a.localeCompare(b, "id");
      });
      return sorted[0];
    };

    const assign = (name, shift) => {
      if (!name) return;
      assigned.set(name, shift);
      counts[name][shift]++;
      counts[name].total++;
    };

    if (day === "Jumat") {
      const maleAvailable = available.filter(n => genderByName[n] === "Pria");
      if (maleAvailable.length !== formation.S2) {
        return {
          entries: [], warnings, range: { start: localDateKey(start), end: localDateKey(end) }, summary: null,
          errors: [`${dateKey} Jumat: ada ${maleAvailable.length} pria masuk, sementara formasi S2 butuh ${formation.S2}. Atur libur Jumat supaya tepat 1 pria libur.`]
        };
      }
      maleAvailable.forEach(name => assign(name, "S2"));
      const women = available.filter(n => genderByName[n] === "Wanita" && !assigned.has(n));
      const mid = pick(women, "Middle");
      assign(mid, "Middle");
      women.filter(n => n !== mid).forEach(name => assign(name, "S1"));
    } else {
      let pool = available.filter(n => !assigned.has(n));

      if (formation.S2 > 0) {
        const malePool = pool.filter(n => genderByName[n] === "Pria");
        const firstMale = pick(malePool, "S2");
        if (!firstMale) return { entries: [], warnings, summary: null, range: null, errors: [`${dateKey}: tidak ada pria tersedia untuk S2.`] };
        assign(firstMale, "S2");
        pool = pool.filter(n => n !== firstMale);

        for (let i = 1; i < formation.S2; i++) {
          const next = pick(pool, "S2", n => genderByName[n] === "Pria" ? -0.15 : 0);
          assign(next, "S2");
          pool = pool.filter(n => n !== next);
        }
      }

      if (formation.Middle > 0) {
        const mid = pick(pool, "Middle");
        assign(mid, "Middle");
        pool = pool.filter(n => n !== mid);
      }

      for (let i = 0; i < formation.S1; i++) {
        const next = pick(pool, "S1");
        assign(next, "S1");
        pool = pool.filter(n => n !== next);
      }

      if (pool.length) return { entries: [], warnings, summary: null, range: null, errors: [`${dateKey}: ${pool.length} crew tidak mendapat shift. Cek formasi/rules.`] };
    }

    const s2Names = [...assigned.entries()].filter(([, shift]) => shift === "S2").map(([name]) => name);
    if (!s2Names.some(name => genderByName[name] === "Pria")) {
      return { entries: [], warnings, summary: null, range: null, errors: [`${dateKey}: S2 tidak memiliki crew pria.`] };
    }

    const roles = assignRolesForDay(assigned, roleCounts, lastRole);

    for (const person of people) {
      const shift = assigned.get(person.name);
      if (!shift) return { entries: [], warnings, summary: null, range: null, errors: [`${dateKey}: ${person.name} belum mendapat status.`] };
      entries.push({
        date: dateKey,
        day,
        crewName: person.name,
        gender: person.gender,
        shift,
        role: roles.get(person.name) || "",
        notes: "",
        overtime: false,
        overtimeType: "",
        overtimeNote: "",
        source: "auto",
        generated: true
      });
      if (shift !== "Libur") lastShift[person.name] = shift;
    }
  }

  const summary = buildSummary(counts, roleCounts, entries);
  return {
    entries,
    errors: [],
    warnings,
    summary,
    range: { start: localDateKey(start), end: localDateKey(end) }
  };
}

function assignRolesForDay(assigned, roleCounts, lastRole) {
  const result = new Map();

  const roleScore = (name, role) => {
    const ownCount = Number(roleCounts[name]?.[role] || 0);
    const repeatPenalty = lastRole[name] === role ? 2.75 : 0;
    const allValues = Object.values(roleCounts).map(row => Number(row?.[role] || 0));
    const roleMin = Math.min(...allValues);
    return ownCount * 10 + (ownCount - roleMin) * 5 + repeatPenalty;
  };

  const commit = (name, role) => {
    result.set(name, role);
    roleCounts[name][role]++;
    lastRole[name] = role;
  };

  for (const shift of ["S1", "S2"]) {
    const names = [...assigned.entries()].filter(([, s]) => s === shift).map(([name]) => name);
    if (!names.length) continue;

    const cashier = names.slice().sort((a, b) => roleScore(a, "Kasir") - roleScore(b, "Kasir") || a.localeCompare(b, "id"))[0];
    commit(cashier, "Kasir");

    const remaining = names.filter(n => n !== cashier);
    if (remaining.length === 1) {
      const name = remaining[0];
      const role = ["Bar", "Kitchen - Bar"].sort((a, b) => roleScore(name, a) - roleScore(name, b) || a.localeCompare(b, "id"))[0];
      commit(name, role);
    } else if (remaining.length >= 2) {
      // Untuk 3 orang dalam satu shift: satu Bar dan satu Kitchen-Bar. Coba dua kombinasi lalu pilih yang paling adil.
      const [a, b, ...rest] = remaining;
      const option1 = roleScore(a, "Bar") + roleScore(b, "Kitchen - Bar");
      const option2 = roleScore(a, "Kitchen - Bar") + roleScore(b, "Bar");
      if (option1 <= option2) {
        commit(a, "Bar");
        commit(b, "Kitchen - Bar");
      } else {
        commit(a, "Kitchen - Bar");
        commit(b, "Bar");
      }
      for (const name of rest) {
        const role = ["Bar", "Kitchen - Bar"].sort((x, y) => roleScore(name, x) - roleScore(name, y))[0];
        commit(name, role);
      }
    }
  }

  const middleNames = [...assigned.entries()].filter(([, s]) => s === "Middle").map(([name]) => name);
  for (const name of middleNames) {
    const role = ["Bar", "Kitchen - Bar"].sort((a, b) => roleScore(name, a) - roleScore(name, b) || a.localeCompare(b, "id"))[0];
    commit(name, role);
  }

  return result;
}

export function suggestNextOffRotation(rulesInput) {
  const rules = normalizeRules(rulesInput);
  const males = rules.maleNames;
  const all = [...rules.maleNames, ...rules.femaleNames];
  if (!males.length || all.length !== 6) return rules;

  const currentFriday = rules.offDays.Jumat?.[0];
  const fridayIndex = Math.max(0, males.indexOf(currentFriday));
  const nextFriday = males[(fridayIndex + 1) % males.length];
  const slotDays = ["Senin", "Senin", "Selasa", "Rabu", "Kamis"];
  const currentNonFriday = [
    ...(rules.offDays.Senin || []),
    ...(rules.offDays.Selasa || []),
    ...(rules.offDays.Rabu || []),
    ...(rules.offDays.Kamis || [])
  ].filter(name => name !== nextFriday);

  const remaining = all.filter(name => name !== nextFriday);
  let ordered = currentNonFriday.filter(name => remaining.includes(name));
  if (currentFriday && remaining.includes(currentFriday) && !ordered.includes(currentFriday)) ordered.push(currentFriday);
  for (const name of remaining) if (!ordered.includes(name)) ordered.push(name);
  ordered = [ordered[ordered.length - 1], ...ordered.slice(0, -1)];

  const next = normalizeRules(rules);
  next.offDays = { Senin: [], Selasa: [], Rabu: [], Kamis: [], Jumat: [nextFriday], Sabtu: [], Minggu: [] };
  ordered.slice(0, 5).forEach((name, index) => next.offDays[slotDays[index]].push(name));
  next.version = Number(rules.version || 1) + 1;
  return next;
}

export function summarizeScheduleEntries(entries = [], crewNames = []) {
  const inferredNames = [...new Set(entries.map(e => e.crewName).filter(Boolean))];
  const names = cleanNames(crewNames.length ? crewNames : inferredNames);
  const counts = Object.fromEntries(names.map(name => [name, { S1: 0, Middle: 0, S2: 0, Libur: 0, total: 0 }]));
  const roleCounts = Object.fromEntries(names.map(name => [name, { Kasir: 0, Bar: 0, "Kitchen - Bar": 0 }]));
  for (const entry of entries) {
    if (!counts[entry.crewName]) continue;
    if (["S1", "Middle", "S2", "Libur"].includes(entry.shift)) counts[entry.crewName][entry.shift]++;
    if (entry.shift !== "Libur") counts[entry.crewName].total++;
    if (roleCounts[entry.crewName] && ["Kasir", "Bar", "Kitchen - Bar"].includes(entry.role)) roleCounts[entry.crewName][entry.role]++;
  }
  return buildSummary(counts, roleCounts, entries);
}

function buildSummary(counts, roleCounts, entries) {
  const rows = Object.entries(counts).map(([name, c]) => ({ name, ...c }));
  const roleRows = Object.entries(roleCounts).map(([name, c]) => ({ name, ...c }));
  const shiftSpreads = ["S1", "Middle", "S2"].map(shift => {
    const vals = rows.map(r => r[shift]);
    return vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
  });
  const roleSpreads = ["Kasir", "Bar", "Kitchen - Bar"].map(role => {
    const vals = roleRows.map(r => r[role]);
    return vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
  });
  const shiftAvgSpread = shiftSpreads.reduce((a, b) => a + b, 0) / Math.max(1, shiftSpreads.length);
  const roleAvgSpread = roleSpreads.reduce((a, b) => a + b, 0) / Math.max(1, roleSpreads.length);
  const fairnessScore = Math.max(0, Math.round(100 - shiftAvgSpread * 8));
  const roleFairnessScore = Math.max(0, Math.round(100 - roleAvgSpread * 7));
  const overallFairnessScore = Math.round((fairnessScore + roleFairnessScore) / 2);
  const days = new Set(entries.map(e => e.date)).size;
  return { rows, roleRows, fairnessScore, roleFairnessScore, overallFairnessScore, days };
}

export function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
