import {
	IconDatabase,
	IconLibrary,
	IconLogout,
	IconMapPin,
	IconSearch,
	IconUsers,
	IconX,
} from '@tabler/icons-solidjs'
import { type JSX, Show } from 'solid-js'
import type { AppUser, Page } from '../types'
import { userDisplayName } from '../utils/books'

export type LayoutProps = {
	page: Page
	isAdmin: boolean
	showSearch: boolean
	query: string
	onQueryChange: (value: string) => void
	onClearQuery: () => void
	user: AppUser | null
	onLogout: () => void
	onNavigate: (path: string, event: MouseEvent) => void
	children: JSX.Element
}

export function Layout(props: LayoutProps) {
	return (
		<div class="page">
			<aside class="sidebar" aria-label="Primary navigation">
				<div class="sidebar-brand">
					<strong>Hausmeister</strong>
				</div>
				<nav class="sidebar-nav" aria-label="Sections">
					<a
						href="/library"
						class={props.page === 'library' || props.page === 'add-book' ? 'active' : ''}
						onClick={(e) => props.onNavigate('/library', e)}
					>
						<IconLibrary size={18} />
						<span>Library</span>
					</a>
					<a
						href="/catalog"
						class={props.page === 'catalog' ? 'active' : ''}
						onClick={(e) => props.onNavigate('/catalog', e)}
					>
						<IconDatabase size={18} />
						<span>Data catalog</span>
					</a>
					<a
						href="/locations"
						class={props.page === 'locations' ? 'active' : ''}
						onClick={(e) => props.onNavigate('/locations', e)}
					>
						<IconMapPin size={18} />
						<span>Locations</span>
					</a>
					<Show when={props.isAdmin}>
						<a
							href="/users"
							class={props.page === 'users' ? 'active' : ''}
							onClick={(e) => props.onNavigate('/users', e)}
						>
							<IconUsers size={18} />
							<span>Users</span>
						</a>
					</Show>
				</nav>
			</aside>
			<header class="topbar">
				<Show when={props.showSearch}>
					<div class="search">
						<IconSearch size={17} class="search-icon" />
						<input
							placeholder="Search title, author, tag, publisher, location, owner, status…"
							value={props.query}
							onInput={(e) => props.onQueryChange(e.currentTarget.value)}
							aria-label="Search books"
						/>
						<Show when={props.query}>
							<button
								type="button"
								class="clear"
								onClick={props.onClearQuery}
								aria-label="Clear search"
							>
								<IconX size={15} />
							</button>
						</Show>
					</div>
				</Show>
				<Show when={props.user}>
					<div class="topbar-user" style="display: flex; align-items: center; gap: 0.5rem">
						<span class="muted small">
							{props.user ? userDisplayName(props.user) : ''}
							<Show when={props.user?.isAdmin}> (admin)</Show>
						</span>
						<button type="button" class="ghost small-btn" onClick={props.onLogout} title="Log out">
							<IconLogout size={14} /> Log out
						</button>
					</div>
				</Show>
			</header>

			<main class={props.page === 'catalog' ? 'catalog-page-layout' : undefined}>
				{props.children}
			</main>
		</div>
	)
}
