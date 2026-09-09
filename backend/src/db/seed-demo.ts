import { accounts, allocations, categories, events, pools, transactions } from './schema'
import { db, sqlite } from './index'

// Tables are created by './index' on import, so this also works on a fresh
// checkout with no data.db yet.
sqlite.exec('PRAGMA foreign_keys = OFF;')
sqlite.exec(
	'DELETE FROM transactions; DELETE FROM allocations; DELETE FROM events; DELETE FROM accounts; DELETE FROM pools; DELETE FROM categories;',
)
sqlite.exec('PRAGMA foreign_keys = ON;')

// db comes from './index' so it shares the same data.db file as the app.

function id() {
	return crypto.randomUUID()
}
function now() {
	return new Date().toISOString()
}

// ---------- Accounts (total 53.000 €) ----------
const accGiro = {
	id: id(),
	name: 'Girokonto ING',
	type: 'checking' as const,
	institution: 'ING DiBa',
	openingDate: '2024-01-01',
	openingBalanceCents: 450_000, // 4.500 €
	iban: 'DE75512108001234567899',
	notes: 'Gehaltskonto, Miete & Fixkosten laufen hierüber',
	createdAt: now(),
}
const accTagesgeld = {
	id: id(),
	name: 'Tagesgeld Trade Republic',
	type: 'savings' as const,
	institution: 'Trade Republic',
	openingDate: '2024-06-01',
	openingBalanceCents: 1_200_000, // 12.000 €
	iban: null,
	notes: 'Notgroschen & kurzfristige Rücklagen, ~2 % p.a.',
	createdAt: now(),
}
const accDepot = {
	id: id(),
	name: 'Depot Trade Republic',
	type: 'broker' as const,
	institution: 'Trade Republic',
	openingDate: '2023-03-15',
	openingBalanceCents: 2_500_000, // 25.000 €
	iban: null,
	notes: 'MSCI World + EM ETF, Sparplan 500 €/Monat',
	createdAt: now(),
}
const accFestgeld = {
	id: id(),
	name: 'Festgeld Weltsparen',
	type: 'festgeld' as const,
	institution: 'Weltsparen',
	openingDate: '2025-09-01',
	openingBalanceCents: 1_000_000, // 10.000 €
	iban: null,
	notes: '2 Jahre, 3,1 % p.a., fällig 2027-09-01',
	createdAt: now(),
}
const accCash = {
	id: id(),
	name: 'Bargeld Reserve',
	type: 'cash' as const,
	institution: null,
	openingDate: '2025-01-01',
	openingBalanceCents: 150_000, // 1.500 €
	iban: null,
	notes: 'Haushaltskasse',
	createdAt: now(),
}
await db.insert(accounts).values([accGiro, accTagesgeld, accDepot, accFestgeld, accCash])

// ---------- Pools ----------
const poolNotgroschen = {
	id: id(),
	name: 'Notgroschen',
	purpose: '6 Monatsausgaben für Notfälle, sofort verfügbar',
	targetMinCents: 800_000,
	targetMaxCents: 1_200_000,
	targetPercent: null,
	expectedReturnBps: 200,
	riskLevel: 1,
	volatilityBps: 0,
	horizonMonths: 0,
	color: '#22c55e',
	createdAt: now(),
}
const poolUrlaub = {
	id: id(),
	name: 'Urlaub & Reisen',
	purpose: 'Sommerurlaub + Städtetrips',
	targetMinCents: 200_000,
	targetMaxCents: 400_000,
	targetPercent: null,
	expectedReturnBps: 200,
	riskLevel: 1,
	volatilityBps: 0,
	horizonMonths: 12,
	color: '#0ea5e9',
	createdAt: now(),
}
const poolAltersvorsorge = {
	id: id(),
	name: 'Altersvorsorge ETF',
	purpose: 'Langfristiger Vermögensaufbau, 20+ Jahre',
	targetMinCents: null,
	targetMaxCents: null,
	targetPercent: 50, // 50 % des Gesamtvermögens
	expectedReturnBps: 700,
	riskLevel: 4,
	volatilityBps: 1800,
	horizonMonths: 240,
	color: '#8b5cf6',
	createdAt: now(),
}
const poolFestgeldLeiter = {
	id: id(),
	name: 'Festgeld-Leiter',
	purpose: 'Mittelfristig geparkt, planbare Fälligkeiten',
	targetMinCents: 800_000,
	targetMaxCents: 1_200_000,
	targetPercent: null,
	expectedReturnBps: 310,
	riskLevel: 1,
	volatilityBps: 0,
	horizonMonths: 24,
	color: '#f59e0b',
	createdAt: now(),
}
const poolSpass = {
	id: id(),
	name: 'Spaß & Konsum',
	purpose: 'Gadgets, Hobbys, ungeplante Wünsche',
	targetMinCents: 50_000,
	targetMaxCents: 200_000,
	targetPercent: null,
	expectedReturnBps: 0,
	riskLevel: 2,
	volatilityBps: 0,
	horizonMonths: 6,
	color: '#ec4899',
	createdAt: now(),
}
await db.insert(pools).values([poolNotgroschen, poolUrlaub, poolAltersvorsorge, poolFestgeldLeiter, poolSpass])

// ---------- Allocations ----------
await db.insert(allocations).values([
	{
		id: id(),
		poolId: poolNotgroschen.id,
		accountId: accTagesgeld.id,
		amountCents: 800_000,
		liquidityOverride: 'instant' as const,
		unlockAt: null,
		createdAt: now(),
	},
	{
		id: id(),
		poolId: poolNotgroschen.id,
		accountId: accGiro.id,
		amountCents: 200_000,
		liquidityOverride: 'instant' as const,
		unlockAt: null,
		createdAt: now(),
	},
	{
		id: id(),
		poolId: poolUrlaub.id,
		accountId: accGiro.id,
		amountCents: 150_000,
		liquidityOverride: 'instant' as const,
		unlockAt: null,
		createdAt: now(),
	},
	{
		id: id(),
		poolId: poolUrlaub.id,
		accountId: accTagesgeld.id,
		amountCents: 100_000,
		liquidityOverride: 'instant' as const,
		unlockAt: null,
		createdAt: now(),
	},
	{
		id: id(),
		poolId: poolAltersvorsorge.id,
		accountId: accDepot.id,
		amountCents: 2_200_000,
		liquidityOverride: 'weeks' as const,
		unlockAt: null,
		createdAt: now(),
	},
	{
		id: id(),
		poolId: poolFestgeldLeiter.id,
		accountId: accFestgeld.id,
		amountCents: 1_000_000,
		liquidityOverride: 'locked' as const,
		unlockAt: '2027-09-01',
		createdAt: now(),
	},
	{
		id: id(),
		poolId: poolSpass.id,
		accountId: accGiro.id,
		amountCents: 80_000,
		liquidityOverride: 'instant' as const,
		unlockAt: null,
		createdAt: now(),
	},
	{
		id: id(),
		poolId: poolSpass.id,
		accountId: accCash.id,
		amountCents: 50_000,
		liquidityOverride: 'instant' as const,
		unlockAt: null,
		createdAt: now(),
	},
])

// ---------- Events ----------
await db.insert(events).values([
	{
		id: id(),
		title: 'Gehalt',
		amountCents: 350_000,
		direction: 'inflow' as const,
		date: '2025-01-01',
		isRecurring: true,
		frequency: 'monthly' as const,
		recurringUntil: '2026-12-31',
		poolId: null,
		accountId: accGiro.id,
		notes: 'Monatlicher Lohn',
		createdAt: now(),
	},
	{
		id: id(),
		title: 'Miete',
		amountCents: 95_000,
		direction: 'outflow' as const,
		date: '2025-01-01',
		isRecurring: true,
		frequency: 'monthly' as const,
		recurringUntil: '2026-12-31',
		poolId: null,
		accountId: accGiro.id,
		notes: 'Warmmiete',
		createdAt: now(),
	},
	{
		id: id(),
		title: 'Strom & Internet',
		amountCents: 12_000,
		direction: 'outflow' as const,
		date: '2025-02-01',
		isRecurring: true,
		frequency: 'monthly' as const,
		recurringUntil: '2026-12-31',
		poolId: null,
		accountId: accGiro.id,
		notes: null,
		createdAt: now(),
	},
	{
		id: id(),
		title: 'ETF Sparplan',
		amountCents: 50_000,
		direction: 'outflow' as const,
		date: '2025-01-15',
		isRecurring: true,
		frequency: 'monthly' as const,
		recurringUntil: '2026-12-31',
		poolId: poolAltersvorsorge.id,
		accountId: accDepot.id,
		notes: 'MSCI World Sparplan',
		createdAt: now(),
	},
	{
		id: id(),
		title: 'Dividende ETFs',
		amountCents: 15_000,
		direction: 'inflow' as const,
		date: '2025-03-15',
		isRecurring: true,
		frequency: 'quarterly' as const,
		recurringUntil: '2026-12-31',
		poolId: poolAltersvorsorge.id,
		accountId: accDepot.id,
		notes: null,
		createdAt: now(),
	},
	{
		id: id(),
		title: 'Kfz-Versicherung',
		amountCents: 60_000,
		direction: 'outflow' as const,
		date: '2025-01-10',
		isRecurring: true,
		frequency: 'yearly' as const,
		recurringUntil: '2028-01-10',
		poolId: null,
		accountId: accGiro.id,
		notes: 'Jährlich',
		createdAt: now(),
	},
	{
		id: id(),
		title: 'Sommerurlaub Kroatien',
		amountCents: 250_000,
		direction: 'outflow' as const,
		date: '2026-08-15',
		isRecurring: false,
		frequency: null,
		recurringUntil: null,
		poolId: poolUrlaub.id,
		accountId: accGiro.id,
		notes: 'Ferienwohnung + Anreise',
		createdAt: now(),
	},
	{
		id: id(),
		title: 'Weihnachtsbonus',
		amountCents: 200_000,
		direction: 'inflow' as const,
		date: '2026-12-15',
		isRecurring: false,
		frequency: null,
		recurringUntil: null,
		poolId: null,
		accountId: accGiro.id,
		notes: null,
		createdAt: now(),
	},
	{
		id: id(),
		title: 'Festgeld Zinsen',
		amountCents: 31_000,
		direction: 'inflow' as const,
		date: '2026-09-01',
		isRecurring: true,
		frequency: 'yearly' as const,
		recurringUntil: '2027-09-01',
		poolId: poolFestgeldLeiter.id,
		accountId: accFestgeld.id,
		notes: '3,1 % auf 10.000 €',
		createdAt: now(),
	},
	{
		id: id(),
		title: 'Zahnarzt Eigenanteil',
		amountCents: 45_000,
		direction: 'outflow' as const,
		date: '2026-09-20',
		isRecurring: false,
		frequency: null,
		recurringUntil: null,
		poolId: poolNotgroschen.id,
		accountId: accTagesgeld.id,
		notes: 'Ungeplant — aus Notgroschen',
		createdAt: now(),
	},
])

// ---------- Categories ----------
const catGehalt = {
	id: id(),
	name: 'Gehalt',
	kind: 'income' as const,
	color: '#22c55e',
	createdAt: now(),
}
const catZinsen = {
	id: id(),
	name: 'Zinsen & Dividenden',
	kind: 'income' as const,
	color: '#0ea5e9',
	createdAt: now(),
}
const catMiete = {
	id: id(),
	name: 'Miete & Wohnen',
	kind: 'expense' as const,
	color: '#f59e0b',
	createdAt: now(),
}
const catLebensmittel = {
	id: id(),
	name: 'Lebensmittel',
	kind: 'expense' as const,
	color: '#65a30d',
	createdAt: now(),
}
const catEnergie = {
	id: id(),
	name: 'Energie & Internet',
	kind: 'expense' as const,
	color: '#8b5cf6',
	createdAt: now(),
}
const catMobilitaet = {
	id: id(),
	name: 'Mobilität',
	kind: 'expense' as const,
	color: '#06b6d4',
	createdAt: now(),
}
const catGesundheit = {
	id: id(),
	name: 'Gesundheit',
	kind: 'expense' as const,
	color: '#ef4444',
	createdAt: now(),
}
const catFreizeit = {
	id: id(),
	name: 'Freizeit & Konsum',
	kind: 'expense' as const,
	color: '#ec4899',
	createdAt: now(),
}
const catSparen = {
	id: id(),
	name: 'Sparen & Invest',
	kind: null,
	color: '#14b8a6',
	createdAt: now(),
}
await db.insert(categories).values([
	catGehalt,
	catZinsen,
	catMiete,
	catLebensmittel,
	catEnergie,
	catMobilitaet,
	catGesundheit,
	catFreizeit,
	catSparen,
])

// ---------- Transactions (actuals ledger) ----------
// Balances stay above allocations: Giro 9670 €, Tagesgeld 12192 €,
// Depot 24150 €, Festgeld 10310 €, Cash 1531 €.
function txn(
	accountId: string,
	date: string,
	payee: string | null,
	categoryId: string | null,
	amountCents: number,
	direction: 'inflow' | 'outflow',
	notes: string | null = null,
	transferId: string | null = null,
) {
	return {
		id: id(),
		accountId,
		date,
		payee,
		categoryId,
		amountCents,
		direction,
		transferId,
		notes,
		createdAt: now(),
	}
}

function transferLegs(
	fromAccountId: string,
	toAccountId: string,
	date: string,
	amountCents: number,
	payee: string | null = null,
	categoryId: string | null = null,
	notes: string | null = null,
) {
	const transferId = id()
	return [
		txn(fromAccountId, date, payee, categoryId, amountCents, 'outflow', notes, transferId),
		txn(toAccountId, date, payee, categoryId, amountCents, 'inflow', notes, transferId),
	]
}

await db.insert(transactions).values([
	// Giro: salary in, rent & living out
	txn(accGiro.id, '2026-01-01', 'Vermieter GmbH', catMiete.id, 95_000, 'outflow', 'Warmmiete Januar'),
	txn(accGiro.id, '2026-01-02', 'Arbeitgeber AG', catGehalt.id, 350_000, 'inflow', 'Gehalt Januar'),
	txn(accGiro.id, '2026-01-05', 'Stadtwerke', catEnergie.id, 12_000, 'outflow', 'Strom & Internet Januar'),
	txn(accGiro.id, '2026-01-08', 'REWE', catLebensmittel.id, 8_500, 'outflow'),
	txn(accGiro.id, '2026-01-10', 'Kfz-Versicherung', catMobilitaet.id, 60_000, 'outflow', 'Jahresbeitrag'),
	txn(accGiro.id, '2026-01-22', 'REWE', catLebensmittel.id, 6_200, 'outflow'),
	txn(accGiro.id, '2026-02-01', 'Vermieter GmbH', catMiete.id, 95_000, 'outflow', 'Warmmiete Februar'),
	txn(accGiro.id, '2026-02-02', 'Arbeitgeber AG', catGehalt.id, 350_000, 'inflow', 'Gehalt Februar'),
	txn(accGiro.id, '2026-02-05', 'Stadtwerke', catEnergie.id, 12_000, 'outflow', 'Strom & Internet Februar'),
	txn(accGiro.id, '2026-02-07', 'REWE', catLebensmittel.id, 7_800, 'outflow'),
	txn(accGiro.id, '2026-02-14', 'Ristorante Roma', catFreizeit.id, 4_500, 'outflow', 'Valentinstag'),
	txn(accGiro.id, '2026-03-01', 'Vermieter GmbH', catMiete.id, 95_000, 'outflow', 'Warmmiete März'),
	txn(accGiro.id, '2026-03-02', 'Arbeitgeber AG', catGehalt.id, 350_000, 'inflow', 'Gehalt März'),
	txn(accGiro.id, '2026-03-06', 'REWE', catLebensmittel.id, 9_100, 'outflow'),
	txn(accGiro.id, '2026-03-10', 'H&M', catFreizeit.id, 7_900, 'outflow', 'Frühjahrskleidung'),
	// Tagesgeld: Zinsen in, Zahnarzt out
	txn(accTagesgeld.id, '2026-07-01', 'Trade Republic', catZinsen.id, 4_200, 'inflow', 'Zinsen Q2'),
	txn(accTagesgeld.id, '2026-08-20', 'Zahnarztpraxis Dr. Weber', catGesundheit.id, 45_000, 'outflow', 'Eigenanteil — aus Notgroschen'),
	// Depot: Sparplan out, Dividende in
	txn(accDepot.id, '2026-01-15', 'Trade Republic', catSparen.id, 50_000, 'outflow', 'MSCI World Sparplan Januar'),
	txn(accDepot.id, '2026-02-15', 'Trade Republic', catSparen.id, 50_000, 'outflow', 'MSCI World Sparplan Februar'),
	txn(accDepot.id, '2026-03-15', 'Trade Republic', catSparen.id, 50_000, 'outflow', 'MSCI World Sparplan März'),
	txn(accDepot.id, '2026-06-15', 'iShares MSCI World', catZinsen.id, 15_000, 'inflow', 'Ausschüttung Q2'),
	// Festgeld: Zinsen in (kein Puffer für Outflows — Allokation = 100 %)
	txn(accFestgeld.id, '2026-09-01', 'Weltsparen', catZinsen.id, 31_000, 'inflow', '3,1 % auf 10.000 €'),
	// Cash: Kiosk & Bäcker out
	txn(accCash.id, '2026-02-03', 'Kiosk Hauptstraße', catLebensmittel.id, 1_200, 'outflow'),
	txn(accCash.id, '2026-02-21', 'Wochenmarkt', catLebensmittel.id, 3_200, 'outflow'),
	txn(accCash.id, '2026-03-07', 'Bäckerei Schmidt', catLebensmittel.id, 2_500, 'outflow'),
	// Transfers (paired legs share a transferId)
	...transferLegs(accGiro.id, accTagesgeld.id, '2026-01-15', 20_000, 'Monatliches Sparen', catSparen.id, 'Notgroschen aufbauen'),
	...transferLegs(accGiro.id, accTagesgeld.id, '2026-02-15', 20_000, 'Monatliches Sparen', catSparen.id, 'Notgroschen aufbauen'),
	...transferLegs(accGiro.id, accTagesgeld.id, '2026-03-15', 20_000, 'Monatliches Sparen', catSparen.id, 'Notgroschen aufbauen'),
	...transferLegs(accGiro.id, accDepot.id, '2026-03-20', 50_000, 'ETF Einmalkauf', catSparen.id, 'Steuerrückzahlung investiert'),
	...transferLegs(accGiro.id, accCash.id, '2026-01-20', 10_000, 'Bargeld abgehoben', null, 'Haushaltskasse auffüllen'),
])

console.log('Demo seed done: 5 accounts, 5 pools, 8 allocations, 10 events, 9 categories, 35 transactions (incl. 5 transfers)')
sqlite.close()
