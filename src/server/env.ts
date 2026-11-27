import { z } from 'zod'

// Server configuration (DESIGN §8.2). Read once, validated with Zod.
// Dev gets sensible defaults; production refuses to start without a real secret.

const DEV_SECRET = 'dev-only-insecure-secret-change-me-0123456789'

/** Compose passes unset optionals as "" (e.g. `${SMTP_URL:-}`); treat that as missing. */
const optional = z
	.string()
	.optional()
	.transform((v) => (v ? v : undefined))

const schema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	ORIGIN: z
		.url()
		.default('http://localhost:3000')
		.transform((v) => new URL(v).origin),
	DATABASE_PATH: z.string().min(1).default('./data/db/app.sqlite'),
	UPLOAD_DIR: z.string().min(1).default('./data/uploads'),
	BETTER_AUTH_SECRET: optional,
	SMTP_URL: optional,
	VAPID_PUBLIC_KEY: optional,
	VAPID_PRIVATE_KEY: optional,
	PORT: z.coerce.number().int().positive().default(3000),
	/** ISBN auto-fill asks DNB / Open Library / Google Books; "off" keeps every lookup local. */
	ISBN_LOOKUP: z
		.string()
		.optional()
		.transform((v) => (v === 'off' ? 'off' : 'on')),
})

export type Env = Omit<z.output<typeof schema>, 'BETTER_AUTH_SECRET'> & {
	BETTER_AUTH_SECRET: string
	isProduction: boolean
}

/** Pure parser, exported for tests. Throws on invalid configuration. */
export function parseEnv(source: Record<string, string | undefined>): Env {
	const parsed = schema.safeParse(source)
	if (!parsed.success) {
		throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`)
	}
	const e = parsed.data
	const isProduction = e.NODE_ENV === 'production'
	let secret = e.BETTER_AUTH_SECRET
	if (!secret) {
		if (isProduction) {
			throw new Error('BETTER_AUTH_SECRET must be set in production.')
		}
		secret = DEV_SECRET
	}
	if (isProduction && secret.length < 32) {
		throw new Error('BETTER_AUTH_SECRET must be at least 32 characters.')
	}
	return { ...e, BETTER_AUTH_SECRET: secret, isProduction }
}

let cached: Env | undefined

/** The validated environment of this process (cached). */
export function getEnv(): Env {
	cached ??= parseEnv(process.env)
	return cached
}
