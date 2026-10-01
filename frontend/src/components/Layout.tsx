import {
	IconDatabase,
	IconLibrary,
	IconLogout,
	IconMapPin,
	IconSearch,
	IconUsers,
	IconX,
} from '@tabler/icons-solidjs'
import { For, type JSX, Show } from 'solid-js'
import { LOCALES, type Locale, locale, setLocale, t } from '../i18n'
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
			<aside class="sidebar" aria-label={t('nav.primary')}>
				<div class="sidebar-brand">
					<strong>Hausmeister</strong>
				</div>
				<nav class="sidebar-nav" aria-label={t('nav.sections')}>
					<a
						href="/library"
						class={props.page === 'library' || props.page === 'add-book' ? 'active' : ''}
						onClick={(e) => props.onNavigate('/library', e)}
					>
						<IconLibrary size={18} />
						<span>{t('nav.library')}</span>
					</a>
					<a
						href="/catalog"
						class={props.page === 'catalog' ? 'active' : ''}
						onClick={(e) => props.onNavigate('/catalog', e)}
					>
						<IconDatabase size={18} />
						<span>{t('nav.catalog')}</span>
					</a>
					<a
						href="/locations"
						class={props.page === 'locations' ? 'active' : ''}
						onClick={(e) => props.onNavigate('/locations', e)}
					>
						<IconMapPin size={18} />
						<span>{t('nav.locations')}</span>
					</a>
					<Show when={props.isAdmin}>
						<a
							href="/users"
							class={props.page === 'users' ? 'active' : ''}
							onClick={(e) => props.onNavigate('/users', e)}
						>
							<IconUsers size={18} />
							<span>{t('nav.users')}</span>
						</a>
					</Show>
				</nav>
				<div class="sidebar-footer">
					<Show when={props.user}>
						<span class="sidebar-user-name">
							{props.user ? userDisplayName(props.user) : ''}
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
								onClick={props.onClearQuery}
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
