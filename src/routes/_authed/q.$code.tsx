// QR label target (DESIGN §5.2): /q/<short code> opens the item or location.
// Signed out, the _authed layout sends the visitor to /login and back here.
// Unknown and invisible codes look the same.
import { createFileRoute, isRedirect, Link, redirect } from '@tanstack/solid-router'
import { isMissing } from '~/components/items/not-found'
import { buttonVariants } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { m } from '~/paraglide/messages'
import { resolveShortCodeFn } from '~/server/items/functions'

export const Route = createFileRoute('/_authed/q/$code')({
	loader: async ({ params }) => {
		try {
			const t = await resolveShortCodeFn({ data: { code: params.code.slice(0, 20) } })
			if (t.kind === 'item')
				throw redirect({ to: '/items/$itemId', params: { itemId: t.id }, replace: true })
			throw redirect({
				to: '/locations/$locationId',
				params: { locationId: t.id },
				replace: true,
			})
		} catch (err) {
			if (isRedirect(err)) throw err
			if (isMissing(err, ['SHORT_CODE_NOT_FOUND'])) return { code: params.code }
			throw err
		}
	},
	head: () => ({ meta: [{ title: `${m.scan_code_unknown_title()} · ${m.app_name()}` }] }),
	component: UnknownCode,
})

function UnknownCode() {
	const data = Route.useLoaderData()
	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<h1>{m.scan_code_unknown_title()}</h1>
				</CardTitle>
				<CardDescription>
					{m.scan_code_unknown_body({ code: data()?.code.toUpperCase() ?? '' })}
				</CardDescription>
			</CardHeader>
			<CardContent class="flex flex-wrap gap-2">
				<Link to="/scan" class={buttonVariants({ variant: 'default' })}>
					{m.scan_title()}
				</Link>
				<Link to="/" class={buttonVariants({ variant: 'outline' })}>
					{m.nav_home()}
				</Link>
			</CardContent>
		</Card>
	)
}
