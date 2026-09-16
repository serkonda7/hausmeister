import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	dialect: 'sqlite',
	schema: ['./src/db/schema.ts', './src/db/schema-inventory.ts'],
	out: './drizzle',
	dbCredentials: {
		url: './data.db',
	},
})
