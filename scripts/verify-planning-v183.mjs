import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const pkg = JSON.parse(read("package.json"));
const firebase = JSON.parse(read("firebase.json"));
const rules = read("firestore.rules");
const main = read("src/main.js");
const planning = read("src/modules/planning/planning.js");
const css = read("src/style.css");

assert(pkg.version === "1.8.3", "package version bukan 1.8.3");
assert(pkg.scripts?.["deploy:rules"]?.includes("sowork-ab04d"), "script deploy:rules belum mengarah ke project sowork-ab04d");
assert(pkg.scripts?.["deploy:all"], "script deploy:all belum tersedia");
assert(firebase.firestore?.rules === "firestore.rules", "firebase.json tidak memakai firestore.rules");
assert(/match\s+\/planning\/\{docId\}/.test(rules), "rule collection planning tidak ditemukan");
assert(/allow\s+read,\s*write:\s*if\s+isAdmin\(\)/.test(rules), "planning belum Admin-only read/write");
assert(planning.includes('const COLLECTION = "planning"'), "planning.js tidak memakai collection planning");
assert(main.includes('planningError: ""'), "planningError state belum ada");
assert(main.includes('Planning Order belum bisa mengakses Firestore'), "warning permission Planning belum ada");
assert(main.includes('planning-qty-control'), "Qty composite control belum dipakai di form");
assert(css.includes('.planning-qty-control'), "CSS Qty composite control belum ada");
assert(css.includes('@media (max-width:760px)'), "responsive mobile Planning belum ada");

console.log("SoWork v1.8.3 Planning verifier: PASS");
