/// <reference types="vite/client" />
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/solid-router'
import { type JSX, onMount } from 'solid-js'
import { HydrationScript } from 'solid-js/web'
import { Toaster } from '~/components/ui/toast'
import { markHydrated } from '~/lib/hydrated'
import { sessionQuery } from '~/lib/session-query'
import { m } from '~/paraglide/messages'
import type { RouterContext } from '~/router'
import appCss from '~/styles/app.css?url'

// SPA: the server renders only this shell (per request, so its scripts carry
// the CSP nonce); every other route runs in the browser (`defaultSsr: false`
// in src/start.ts). This route is `data-only`: its beforeLoad also runs on the
// server, so the shell already carries the session and the browser skips that
// round trip before it can load the page (src/router.tsx seeds the Query cache).
export const Route = createRootRouteWithContext<RouterContext>()({
	ssr: 'data-only',
	// Every route can read `context.user` (SessionUser | null).
	beforeLoad: async ({ context, matches }) => {
		// In-app navigations re-check a stale session first; fetch the matched
		// routes' code meanwhile instead of after it.
		context.preloadRouteChunks(matches)
		return { user: await context.queryClient.fetchQuery(sessionQuery()) }
	},
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1, viewport-fit=cover',
			},
			{ name: 'theme-color', content: '#232528' },
			{ title: m.app_name() },
		],
		links: [{ rel: 'stylesheet', href: appCss }],
	}),
	notFoundComponent: () => (
		<main class="mx-auto grid max-w-3xl justify-items-start gap-3 p-4">
			<p>{m.error_not_found()}</p>
			<a href="/" class="text-primary underline underline-offset-4">
				{m.error_back_home()}
			</a>
		</main>
	),
	shellComponent: RootDocument,
	component: Outlet,
})

function RootDocument(props: { children: JSX.Element }) {
	onMount(markHydrated)
	return (
		<html lang="de">
			<head>
				<HydrationScript />
				<HeadContent />
			</head>
			<body class="min-h-dvh antialiased">
				{/* Shown until the app has started (styles hide it via html[data-hydrated]). */}
				<div class="boot-splash" aria-hidden="true">
					{m.common_loading()}
				</div>
				{props.children}
				<Toaster />
				<Scripts />
			</body>
		</html>
	)
}
