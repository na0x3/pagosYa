// Brand bench (docs/YAPI_MIGRATION_PLAN.md §3): the seven benchmark brands rebuilt on the dev stack, measured the same way each
// round. Plain .cjs on purpose: the API watcher compiles every .ts under apps/api, and a script's type error would stop its restarts.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../../..');
const API_DIR = path.join(ROOT, 'apps/api');
const BENCH = path.join(ROOT, 'examples/brand-bench');
const KEYS = ['noa', 'ohbelly', 'boxy', 'pawby', 'rhode', 'remolino', 'cuadrizate'];
const NAMES = { noa: 'NOA VARGAS Atelier', ohbelly: 'Oh Belly', boxy: 'BOXY', pawby: 'Pawby Kitchen', rhode: 'rhode', remolino: 'Remolino', cuadrizate: 'Cuadrízate' };
const API = process.env.API || 'http://127.0.0.1:3001';
// The dev session lives outside the repo (it is a bearer token).
const LIVE = process.env.BENCH_LIVE || path.join(os.homedir(), 'pagosya-benchmarks', 'live.json');

const brands = () => JSON.parse(fs.readFileSync(path.join(BENCH, 'brands.json'), 'utf8'));
const demoPath = (round, key) => path.join(ROOT, 'examples', `cmp-${round}-${key}`, 'demo.json');
const demo = (round, key) => JSON.parse(fs.readFileSync(demoPath(round, key), 'utf8'));
const live = () => JSON.parse(fs.readFileSync(LIVE, 'utf8'));
const roundDir = round => { const dir = path.join(BENCH, round); fs.mkdirSync(dir, { recursive: true }); return dir; };
const prisma = () => new (require(path.join(API_DIR, 'node_modules/@prisma/client')).PrismaClient)();

module.exports = { ROOT, API_DIR, BENCH, KEYS, NAMES, API, LIVE, brands, demoPath, demo, live, roundDir, prisma };
