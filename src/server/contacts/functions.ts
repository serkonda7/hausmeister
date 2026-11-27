// Server functions for external contacts (admin and member). Logic: ./service.ts.
import { createServerFn } from '@tanstack/solid-start'
import { z } from 'zod'
import { idSchema } from '~/lib/items/inputs'
import { contactInput, updateContactInput } from '~/lib/loans/inputs'
import { roleMiddleware } from '../auth/middleware'
import { itemsDb } from '../search/ready'
import { createContact, deleteContact, listContacts, updateContact } from './service'

/** ContactRow[] sorted by name. */
export const listContactsFn = createServerFn({ method: 'GET' })
	.middleware([roleMiddleware('admin', 'member')])
	.handler(({ context: { ctx } }) => listContacts(itemsDb(), ctx))

/** Returns { id }. */
export const createContactFn = createServerFn({ method: 'POST' })
	.middleware([roleMiddleware('admin', 'member')])
	.validator(contactInput)
	.handler(({ context: { ctx }, data }) => createContact(itemsDb(), ctx, data))

export const updateContactFn = createServerFn({ method: 'POST' })
	.middleware([roleMiddleware('admin', 'member')])
	.validator(updateContactInput)
	.handler(({ context: { ctx }, data }) => {
		updateContact(itemsDb(), ctx, data)
		return { ok: true as const }
	})

/** CONTACT_IN_USE while the contact has open loans. */
export const deleteContactFn = createServerFn({ method: 'POST' })
	.middleware([roleMiddleware('admin', 'member')])
	.validator(z.object({ id: idSchema }))
	.handler(({ context: { ctx }, data }) => {
		deleteContact(itemsDb(), ctx, data.id)
		return { ok: true as const }
	})
