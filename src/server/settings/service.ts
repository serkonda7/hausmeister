// Household settings singleton (settings.id = 1). Any signed-in user may read
// it; only admins may change it. The locale is fixed (German-only app).
import { eq } from 'drizzle-orm'
import { diffFields } from '../../lib/diff'
import { recordEvent } from '../audit'
import { HttpError, requireRole } from '../auth/context'
import type { AuthCtx } from '../authz/ctx'
import type { AppDb, DbOrTx } from '../db/client'
import { settings } from '../db/schema'

export const HOUSEHOLD_NAME_MAX_LENGTH = 80
export const CURRENCIES = ['EUR', 'CHF', 'USD', 'GBP'] as const

export type Settings = {
	householdName: string
	currency: string
	locale: string
}

export type SettingsInput = {
	householdName: string
	currency: string
}

/** The singleton always exists (a migration inserts id 1); fallbacks keep tests simple. */
function current(db: DbOrTx): Settings {
	const row = db.select().from(settings).where(eq(settings.id, 1)).get()
	return {
		householdName: row?.householdName ?? 'Unser Haushalt',
		currency: row?.currency ?? 'EUR',
		locale: row?.locale ?? 'de-DE',
	}
}

export function getSettings(db: AppDb): Settings {
	return current(db)
}

function cleanName(value: string): string {
	const v = value.trim()
	if (!v || v.length > HOUSEHOLD_NAME_MAX_LENGTH) {
		throw new HttpError(422, 'SETTINGS_NAME_INVALID')
	}
	return v
}

function cleanCurrency(value: string): string {
	if (!(CURRENCIES as readonly string[]).includes(value)) {
		throw new HttpError(422, 'SETTINGS_CURRENCY_INVALID')
	}
	return value
}

export function updateSettings(db: AppDb, ctx: AuthCtx, input: SettingsInput): Settings {
	requireRole(ctx, 'admin')
	const householdName = cleanName(input.householdName)
	const currency = cleanCurrency(input.currency)

	return db.transaction((tx) => {
		const before = current(tx)
		const after = { householdName, currency }
		const diff = diffFields(
			{ householdName: before.householdName, currency: before.currency },
			after,
		)

		tx.update(settings).set(after).where(eq(settings.id, 1)).run()
		if (Object.keys(diff).length > 0) {
			recordEvent(tx, {
				actorId: ctx.userId,
				action: 'settings.updated',
				diff,
			})
		}
		return { ...after, locale: before.locale }
	})
}
