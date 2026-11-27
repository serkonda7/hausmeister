// The friendly page for an item or location that does not exist or that the
// caller may not see; both look exactly the same (DESIGN §11).
import { Link } from '@tanstack/solid-router'
import { buttonVariants } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { m } from '~/paraglide/messages'

export function NotFoundCard(props: { kind: 'item' | 'location' }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<h1>
						{props.kind === 'item'
							? m.item_not_found_title()
							: m.locations_not_found_title()}
					</h1>
				</CardTitle>
				<CardDescription>
					{props.kind === 'item' ? m.item_not_found_body() : m.locations_not_found_body()}
				</CardDescription>
			</CardHeader>
			<CardContent class="flex flex-wrap gap-2">
				<Link
					to={props.kind === 'item' ? '/items' : '/locations'}
					class={buttonVariants({ variant: 'default' })}
				>
					{props.kind === 'item'
						? m.item_not_found_to_list()
						: m.locations_not_found_to_list()}
				</Link>
				<Link to="/" class={buttonVariants({ variant: 'outline' })}>
					{m.nav_home()}
				</Link>
			</CardContent>
		</Card>
	)
}

/** Loader helper: true for errors that mean "show the not-found page". */
export function isMissing(err: unknown, codes: readonly string[]): boolean {
	const msg = err instanceof Error ? err.message : ''
	const code = msg.split(':')[0] ?? ''
	return codes.includes(code) || code === 'INVALID_INPUT'
}
