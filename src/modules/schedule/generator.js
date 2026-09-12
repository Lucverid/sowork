export const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const DEFAULT_FORMATIONS = {
  Senin: { S1: 2, Middle: 0, S2: 2 },
  Selasa: { S1: 2, Middle: 1, S2: 2 },
  Rabu: { S1: 2, Middle: 1, S2: 2 },
  Kamis: { S1: 2, Middle: 1, S2: 2 },
  Jumat: { S1: 2, Middle: 1, S2: 2 },
  Sabtu: { S1: 2, Middle: 1, S2: 3 },
  Minggu: { S1: 2, Middle: 1, S2: 3 }
};

const DEFAULT_DAY_CONSTRAINTS = {
  Senin: { minMaleS2: 1, s1Gender: "Any", middleGender: "Any" },
  Selasa: { minMaleS2: 1, s1Gender: "Any", middleGender: "Any" },
  Rabu: { minMaleS2: 1, s1Gender: "Any", middleGender: "Any" },
  Kamis: { minMaleS2: 1, s1Gender: "Any", middleGender: "Any" },
  Jumat: { minMaleS2: 1, s1Gender: "Wanita", middleGender: "Wanita" },
  Sabtu: { minMaleS2: 1, s1Gender: "Any", middleGender: "Any" },
  Minggu: { minMaleS2: 1, s1Gender: "Any", middleGender: "Any" }
};

export const DEFAULT_SCHEDULE_RULES = {
  crew: [
    { name: "Agis", gender: "Pria", active: true },
    { name: "Ruhimat", gender: "Pria", active: true },
    { name: "Tegar", gender: "Pria", active: true },
    { name: "Nabila", gender: "Wanita", active: true },
    { name: "Mirya", gender: "Wanita", active: true },
    { name: "Cahya", gender: "Wanita", active: true }
  ],
  offDays: {
    Senin: ["Tegar", "Nabila"],
    Selasa: ["Ruhimat"],
    Rabu: ["Mirya"],
    Kamis: ["Cahya"],
    Jumat: ["Agis"],
    Sabtu: [],
    Minggu: []
  },
  formations: DEFAULT_FORMATIONS,
  dayConstraints: DEFAULT_DAY_CONSTRAINTS,
  rolesByShift: {
    S1: ["Kasir", "Bar", "Kitchen - Bar"],
    Middle: ["Bar", "Kitchen - Bar"],
    S2: ["Kasir", "Bar", "Kitchen - Bar"]
  },
  version: 2
};

export const SCHEDULE_PRESETS = {
  normal6: {
    label: "Normal 6 Crew",
    formations: DEFAULT_FORMATIONS,
    dayConstraints: DEFAULT_DAY_CONSTRAINTS
  },
  crew5: {
    label: "5 Crew",
    formations: {
      Senin: { S1: 2, Middle: 0, S2: 2 },
      Selasa: { S1: 2, Middle: 0, S2: 2 },
      Rabu: { S1: 2, Middle: 0, S2: 2 },
      Kamis: { S1: 2, Middle: 0, S2: 2 },
      Jumat: { S1: 2, Middle: 0, S2: 2 },
      Sabtu: { S1: 2, Middle: 1, S2: 2 },
      Minggu: { S1: 2, Middle: 1, S2: 2 }
    },
    dayConstraints: Object.fromEntries(DAY_NAMES.map(day => [day, { minMaleS2: 1, s1Gender: "Any", middleGender: "Any" }]))
  },
  crew4: {
    label: "Minimal 4 Crew",
    formations: Object.fromEntries(DAY_NAMES.map(day => [day, { S1: 2, Middle: 0, S2: 2 }])),
    dayConstraints: Object.fromEntries(DAY_NAMES.map(day => [day, { minMaleS2: 1, s1Gender: "Any", middleGender: "Any" }]))
  },
  busyWeekend: {
    label: "Ramai Weekend",
    formations: {
      ...DEFAULT_FORMATIONS,
      Sabtu: { S1: 2, Middle: 1, S2: 3 },
      Minggu: { S1: 2, Middle: 1, S2: 3 }
    },
    dayConstraints: DEFAULT_DAY_CONSTRAINTS
  }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeGender(value) {
  return String(value || "").toLowerCase() === "wanita" ? "Wanita" : "Pria";
}

function normalizeGenderConstraint(value) {
  const raw = String(value || "Any");
  return raw === "Pria" || raw === "Wanita" ? raw : "Any";
}

function int0(value) {
  return Math.max(0, Math.floor(Number(value || 0)));
}

export function cleanNames(value) {
  const arr = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(arr.map(x => String(x).trim()).filter(Boolean))];
}

export function normalizeRules(input = {}) {
  const base = clone(DEFAULT_SCHEDULE_RULES);

  let crewInput = Array.isArray(input.crew) ? input.crew : null;
  if (!crewInput) {
    const maleNames = Array.isArray(input.maleNames) ? input.maleNames : base.crew.filter(x => x.gender === "Pria").map(x => x.name);
    const femaleNames = Array.isArray(input.femaleNames) ? input.femaleNames : base.crew.filter(x => x.gender === "Wanita").map(x => x.name);
    crewInput = [
      ...cleanNames(maleNames).map(name => ({ name, gender: "Pria", active: true })),
      ...cleanNames(femaleNames).map(name => ({ name, gender: "Wanita", active: true }))
    ];
  }

  const crew = [];
  for (const row of crewInput) {
    const name = String(row?.name || "").trim();
    if (!name) continue;
    crew.push({
      name,
      gender: normalizeGender(row?.gender),
      active: row?.active !== false
    });
  }

  const offDays = {};
  for (const day of DAY_NAMES) {
    offDays[day] = cleanNames(input?.offDays?.[day] ?? base.offDays[day] ?? []);
  }

  const formations = {};
  for (const day of DAY_NAMES) {
    const src = input?.formations?.[day] || base.formations[day] || {};
    formations[day] = {
      S1: int0(src.S1),
      Middle: int0(src.Middle),
      S2: int0(src.S2)
    };
  }

  const dayConstraints = {};
  for (const day of DAY_NAMES) {
    const src = input?.dayConstraints?.[day] || base.dayConstraints[day] || {};
    dayConstraints[day] = {
      minMaleS2: int0(src.minMaleS2),
      s1Gender: normalizeGenderConstraint(src.s1Gender),
      middleGender: normalizeGenderConstraint(src.middleGender)
    };
  }

  const rolesByShift = {};
  for (const shift of ["S1", "Middle", "S2"]) {
    const fallback = base.rolesByShift[shift] || [];
    rolesByShift[shift] = cleanNames(input?.rolesByShift?.[shift] ?? fallback);
  }

  const activeCrew = crew.filter(x => x.active !== false);
  // maleNames/femaleNames menyimpan seluruh master crew agar export histori lama
  // tetap membaca gender dengan benar walau crew sudah dinonaktifkan.
  const maleNames = crew.filter(x => x.gender === "Pria").map(x => x.name);
  const femaleNames = crew.filter(x => x.gender === "Wanita").map(x => x.name);

  return {
    crew,
    maleNames,
    femaleNames,
    activeNames: activeCrew.map(x => x.name),
    offDays,
    formations,
    dayConstraints,
    rolesByShift,
    version: Math.max(2, Number(input.version || 2))
  };
}

export function applySchedulePreset(rulesInput, presetId) {
  const rules = normalizeRules(rulesInput);
  const preset = SCHEDULE_PRESETS[presetId];
  if (!preset) return rules;
  return normalizeRules({
    ...rules,
    formations: clone(preset.formations),
    dayConstraints: clone(preset.dayConstraints),
    version: Number(rules.version || 2) + 1
  });
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
  const allNames = rules.crew.map(x => x.name);
  const activeCrew = rules.crew.filter(x => x.active !== false);
  const activeNames = activeCrew.map(x => x.name);

  const duplicates = allNames.filter((name, i) => allNames.indexOf(name) !== i);
  if (duplicates.length) errors.push(`Nama crew duplikat: ${[...new Set(duplicates)].join(", ")}.`);
  if (!activeCrew.length) errors.push("Minimal harus ada 1 crew aktif.");

  for (const day of DAY_NAMES) {
    const formation = rules.formations[day];
    const constraint = rules.dayConstraints[day];
    const off = rules.offDays[day] || [];
    const unknown = off.filter(name => !allNames.includes(name));
    if (unknown.length) errors.push(`${day}: crew libur tidak ditemukan: ${unknown.join(", ")}.`);
    const inactiveOff = off.filter(name => allNames.includes(name) && !activeNames.includes(name));
    if (inactiveOff.length) warnings.push(`${day}: ${inactiveOff.join(", ")} sudah nonaktif, jadi tidak perlu dimasukkan ke libur.`);

    const activeOff = [...new Set(off.filter(name => activeNames.includes(name)))];
    const available = activeCrew.filter(x => !activeOff.includes(x.name));
    const required = formation.S1 + formation.Middle + formation.S2;

    if (required !== available.length) {
      errors.push(`${day}: formasi butuh ${required} orang, tetapi crew tersedia ${available.length} (${activeCrew.length} aktif - ${activeOff.length} libur).`);
    }
    if (constraint.minMaleS2 > formation.S2) {
      errors.push(`${day}: minimum pria S2 (${constraint.minMaleS2}) melebihi jumlah S2 (${formation.S2}).`);
    }

    const availableMale = available.filter(x => x.gender === "Pria").length;
    const availableFemale = available.filter(x => x.gender === "Wanita").length;
    const maleRequired = constraint.minMaleS2
      + (constraint.s1Gender === "Pria" ? formation.S1 : 0)
      + (constraint.middleGender === "Pria" ? formation.Middle : 0);
    const femaleRequired = (constraint.s1Gender === "Wanita" ? formation.S1 : 0)
      + (constraint.middleGender === "Wanita" ? formation.Middle : 0);

    if (availableMale < maleRequired) errors.push(`${day}: butuh minimal ${maleRequired} pria berdasarkan rules, tersedia ${availableMale}.`);
    if (availableFemale < femaleRequired) errors.push(`${day}: butuh minimal ${femaleRequired} wanita berdasarkan rules, tersedia ${availableFemale}.`);

    for (const shift of ["S1", "Middle", "S2"]) {
      if (formation[shift] > 0 && !rules.rolesByShift[shift]?.length) {
        errors.push(`${day}: role untuk ${shift} kosong.`);
      }
    }
  }

  const offCountByCrew = Object.fromEntries(activeNames.map(n => [n, 0]));
  for (const day of DAY_NAMES) {
    for (const name of rules.offDays[day] || []) {
      if (name in offCountByCrew) offCountByCrew[name] += 1;
    }
  }
  const uneven = Object.entries(offCountByCrew).filter(([, count]) => count !== 1);
  if (uneven.length) warnings.push(`Rotasi libur belum 1x/crew per minggu: ${uneven.map(([n,c]) => `${n}=${c}`).join(", ")}.`);
  if (activeCrew.length < 4) warnings.push("Crew aktif di bawah 4. Pastikan formasi harian benar-benar realistis.");

  return { rules, errors, warnings };
}

export function generateSchedule({ year, month, includeCarryover = false, rules: rulesInput }) {
  const { rules, errors, warnings } = validateRules(rulesInput);
  if (errors.length) return { entries: [], errors, warnings, summary: null, range: null };

  const { start, end } = periodForMonth(year, month, includeCarryover);
  const people = rules.crew.filter(x => x.active !== false).map(x => ({ name: x.name, gender: x.gender }));
  const genderByName = Object.fromEntries(people.map(p => [p.name, p.gender]));
  const counts = Object.fromEntries(people.map(p => [p.name, { S1: 0, Middle: 0, S2: 0, Libur: 0, total: 0 }]));
  const roleNames = cleanNames(Object.values(rules.rolesByShift).flat());
  const roleCounts = Object.fromEntries(people.map(p => [p.name, Object.fromEntries(roleNames.map(role => [role, 0]))]));
  const lastShift = Object.fromEntries(people.map(p => [p.name, null]));
  const lastRole = Object.fromEntries(people.map(p => [p.name, null]));
  const entries = [];

  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = new Date(cursor);
    const dateKey = localDateKey(date);
    const day = DAY_NAMES[date.getDay()];
    const formation = rules.formations[day];
    const constraint = rules.dayConstraints[day];
    const offNames = new Set((rules.offDays[day] || []).filter(name => counts[name]));
    const available = people.filter(p => !offNames.has(p.name));
    const assigned = new Map();

    for (const name of offNames) {
      assigned.set(name, "Libur");
      counts[name].Libur += 1;
    }

    const slots = [];
    for (let i = 0; i < formation.S1; i += 1) slots.push({ shift: "S1", gender: constraint.s1Gender });
    for (let i = 0; i < formation.Middle; i += 1) slots.push({ shift: "Middle", gender: constraint.middleGender });
    for (let i = 0; i < formation.S2; i += 1) slots.push({ shift: "S2", gender: i < constraint.minMaleS2 ? "Pria" : "Any" });

    slots.sort((a, b) => (a.gender === "Any") - (b.gender === "Any") || shiftPriority(a.shift) - shiftPriority(b.shift));

    const selected = assignSlotsBacktracking(slots, available, counts, lastShift);
    if (!selected) {
      return {
        entries: [], warnings,
        range: { start: localDateKey(start), end: localDateKey(end) },
        summary: null,
        errors: [`${dateKey} ${day}: rules tidak bisa dipenuhi dengan crew yang tersedia. Cek gender constraint, minimum pria S2, formasi, dan libur.`]
      };
    }

    for (const [name, shift] of selected.entries()) {
      assigned.set(name, shift);
      counts[name][shift] += 1;
      counts[name].total += 1;
    }

    const roles = assignRolesForDay(assigned, roleCounts, lastRole, rules.rolesByShift);

    for (const person of people) {
      const shift = assigned.get(person.name);
      if (!shift) {
        return { entries: [], warnings, summary: null, range: null, errors: [`${dateKey}: ${person.name} belum mendapat status.`] };
      }
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

  const summary = buildSummary(counts, roleCounts, entries, roleNames);
  return {
    entries,
    errors: [],
    warnings,
    summary,
    range: { start: localDateKey(start), end: localDateKey(end) }
  };
}

function shiftPriority(shift) {
  return shift === "Middle" ? 0 : shift === "S2" ? 1 : 2;
}

function assignSlotsBacktracking(slots, available, counts, lastShift) {
  const used = new Set();
  const selected = new Map();

  const score = (person, shift) => {
    const row = counts[person.name] || {};
    return Number(row[shift] || 0) * 12
      + Number(row.total || 0) * 0.6
      + (lastShift[person.name] === shift ? 4 : 0);
  };

  const recurse = index => {
    if (index >= slots.length) return true;
    const slot = slots[index];
    const candidates = available
      .filter(person => !used.has(person.name) && (slot.gender === "Any" || person.gender === slot.gender))
      .sort((a, b) => score(a, slot.shift) - score(b, slot.shift) || a.name.localeCompare(b.name, "id"));

    for (const person of candidates) {
      used.add(person.name);
      selected.set(person.name, slot.shift);
      if (recurse(index + 1)) return true;
      selected.delete(person.name);
      used.delete(person.name);
    }
    return false;
  };

  return recurse(0) ? selected : null;
}

function assignRolesForDay(assigned, roleCounts, lastRole, rolesByShift) {
  const result = new Map();

  for (const shift of ["S1", "Middle", "S2"]) {
    const names = [...assigned.entries()].filter(([, s]) => s === shift).map(([name]) => name);
    const roles = cleanNames(rolesByShift?.[shift] || []);
    if (!names.length || !roles.length) continue;

    for (const name of names) {
      const role = roles.slice().sort((a, b) => {
        const countA = Number(roleCounts[name]?.[a] || 0);
        const countB = Number(roleCounts[name]?.[b] || 0);
        const repeatA = lastRole[name] === a ? 2.75 : 0;
        const repeatB = lastRole[name] === b ? 2.75 : 0;
        const usedTodayA = [...result.values()].filter(x => x === a).length * 1.25;
        const usedTodayB = [...result.values()].filter(x => x === b).length * 1.25;
        return (countA * 10 + repeatA + usedTodayA) - (countB * 10 + repeatB + usedTodayB) || a.localeCompare(b, "id");
      })[0];
      result.set(name, role);
      if (!(role in roleCounts[name])) roleCounts[name][role] = 0;
      roleCounts[name][role] += 1;
      lastRole[name] = role;
    }
  }

  return result;
}

export function suggestNextOffRotation(rulesInput) {
  const rules = normalizeRules(rulesInput);
  const active = rules.crew.filter(x => x.active !== false).map(x => x.name);
  if (active.length < 2) return rules;
  const nextName = name => {
    const index = active.indexOf(name);
    return index >= 0 ? active[(index + 1) % active.length] : name;
  };
  const next = normalizeRules(rules);
  for (const day of DAY_NAMES) {
    next.offDays[day] = cleanNames((rules.offDays[day] || []).filter(name => active.includes(name)).map(nextName));
  }
  next.version = Number(rules.version || 2) + 1;
  return next;
}

export function summarizeScheduleEntries(entries = [], crewNames = []) {
  const inferredNames = [...new Set(entries.map(e => e.crewName).filter(Boolean))];
  const names = cleanNames(crewNames.length ? crewNames : inferredNames);
  const roles = cleanNames(entries.map(e => e.role).filter(Boolean));
  const counts = Object.fromEntries(names.map(name => [name, { S1: 0, Middle: 0, S2: 0, Libur: 0, total: 0 }]));
  const roleCounts = Object.fromEntries(names.map(name => [name, Object.fromEntries(roles.map(role => [role, 0]))]));
  for (const entry of entries) {
    if (!counts[entry.crewName]) continue;
    if (["S1", "Middle", "S2", "Libur"].includes(entry.shift)) counts[entry.crewName][entry.shift] += 1;
    if (entry.shift !== "Libur") counts[entry.crewName].total += 1;
    if (entry.role) {
      if (!(entry.role in roleCounts[entry.crewName])) roleCounts[entry.crewName][entry.role] = 0;
      roleCounts[entry.crewName][entry.role] += 1;
    }
  }
  return buildSummary(counts, roleCounts, entries, roles);
}

function buildSummary(counts, roleCounts, entries, roleNames = []) {
  const rows = Object.entries(counts).map(([name, c]) => ({ name, ...c }));
  const roleRows = Object.entries(roleCounts).map(([name, c]) => ({ name, ...c }));
  const shiftSpreads = ["S1", "Middle", "S2"].map(shift => {
    const vals = rows.map(r => Number(r[shift] || 0));
    return vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
  });
  const roles = roleNames.length ? roleNames : cleanNames(roleRows.flatMap(row => Object.keys(row).filter(k => k !== "name")));
  const roleSpreads = roles.map(role => {
    const vals = roleRows.map(r => Number(r[role] || 0));
    return vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
  });
  const shiftAvgSpread = shiftSpreads.reduce((a, b) => a + b, 0) / Math.max(1, shiftSpreads.length);
  const roleAvgSpread = roleSpreads.reduce((a, b) => a + b, 0) / Math.max(1, roleSpreads.length);
  const fairnessScore = Math.max(0, Math.round(100 - shiftAvgSpread * 8));
  const roleFairnessScore = Math.max(0, Math.round(100 - roleAvgSpread * 7));
  const overallFairnessScore = Math.round((fairnessScore + roleFairnessScore) / 2);
  const days = new Set(entries.map(e => e.date)).size;
  return { rows, roleRows, roleNames: roles, fairnessScore, roleFairnessScore, overallFairnessScore, days };
}

export function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
