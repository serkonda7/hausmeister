import {
	IconBookmarks,
	IconDatabase,
	IconLibrary,
	IconLogout,
	IconMapPin,
	IconSearch,
	IconUsers,
	IconX,
} from '@tabler/icons-solidjs'
import { For, type JSX, Show } from 'solid-js'
import { LOCALES, type Locale, locale, setLocale, type TranslationKey, t } from '../i18n'
import { PAGE_PATHS, type Page, type StaticPage } from '../routes'
import type { PublicUser } from '../types'
import { userDisplayName } from '../utils/books'

type NavItem = {
	page: StaticPage
	label: TranslationKey
	icon: (props: { size: number }) => JSX.Element
	adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
	{ page: 'library', label: 'nav.library', icon: IconLibrary },
	{ page: 'reading', label: 'nav.reading', icon: IconBookmarks },
	{ page: 'catalog', label: 'nav.catalog', icon: IconDatabase },
	{ page: 'locations', label: 'nav.locations', icon: IconMapPin },
	{ page: 'users', label: 'nav.users', icon: IconUsers, adminOnly: true },
]

export type LayoutProps = {
	page: Page
	user: PublicUser | null
	showSearch: boolean
	query: string
	onQueryChange: (value: string) => void
	onLogout: () => void
	onNavigate: (path: string, event: MouseEvent) => void
	children: JSX.Element
}

export function Layout(props: LayoutProps) {
	// The add-book and book pages belong to the library section, author and publisher pages to the catalog.
	const section = () => {
		if (props.page === 'add-book' || props.page === 'book') return 'library'
		if (props.page === 'author' || props.page === 'publisher') return 'catalog'
		return props.page
	}
	const visibleItems = () => NAV_ITEMS.filter((item) => !item.adminOnly || props.user?.isAdmin)

	return (
		<div class="page">
			<aside class="sidebar" aria-label={t('nav.primary')}>
				<div class="sidebar-brand">
					<strong>Hausmeister</strong>
				</div>
				<nav class="sidebar-nav" aria-label={t('nav.sections')}>
					<For each={visibleItems()}>
						{(item) => (
							<a
								href={PAGE_PATHS[item.page]}
								class={section() === item.page ? 'active' : ''}
								onClick={(e) => props.onNavigate(PAGE_PATHS[item.page], e)}
							>
								<item.icon size={18} />
								<span>{t(item.label)}</span>
							</a>
						)}
					</For>
				</nav>
				<div class="sidebar-footer">
					<Show when={props.user}>
						<span class="sidebar-user-name">
							{props.user && userDisplayName(props.user)}
							<Show when={props.user?.isAdmin}>
								<span class="muted"> {t('auth.adminSuffix')}</span>
							</Show>
						</span>
					</Show>
					<select
						class="language-select"
						value={locale()}
						onChange={(e) => setLocale(e.currentTarget.value as Locale)}
						aria-label={t('language.label')}
						title={t('language.label')}
					>
						<For each={LOCALES}>{(l) => <option value={l.id}>{l.label}</option>}</For>
					</select>
					<Show when={props.user}>
						<button
							type="button"
							class="ghost small-btn"
							onClick={props.onLogout}
							title={t('auth.logout')}
						>
							<IconLogout size={14} /> {t('auth.logout')}
						</button>
					</Show>
				</div>
			</aside>
			<Show when={props.showSearch}>
				<header class="topbar">
					<div class="search">
						<IconSearch size={17} class="search-icon" />
						<input
							placeholder={t('search.placeholder')}
							value={props.query}
							onInput={(e) => props.onQueryChange(e.currentTarget.value)}
							aria-label={t('search.label')}
						/>
						<Show when={props.query}>
							<button
								type="button"
								class="clear"
								onClick={() => props.onQueryChange('')}
								aria-label={t('search.clear')}
							>
								<IconX size={15} />
							</button>
						</Show>
					</div>
				</header>
			</Show>

			<main class={props.page === 'catalog' ? 'catalog-page-layout' : undefined}>
				{props.children}
			</main>
		</div>
	)
}
