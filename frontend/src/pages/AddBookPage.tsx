import { AddBookPanel, type AddBookPanelProps } from '../components/AddBookPanel'
import { t } from '../i18n'

export type AddBookPageProps = {
	addPanelProps: AddBookPanelProps
	onNavigate: (path: string, event: MouseEvent) => void
}

export function AddBookPage(props: AddBookPageProps) {
	return (
		<div class="add-book-page">
			<nav class="breadcrumb" aria-label={t('nav.breadcrumb')}>
				<a href="/library" onClick={(e) => props.onNavigate('/library', e)}>
					{t('nav.library')}
				</a>
				<span class="breadcrumb-separator" aria-hidden="true">
					/
				</span>
				<span class="breadcrumb-current" aria-current="page">
					{t('library.addBook')}
				</span>
			</nav>

			<AddBookPanel {...props.addPanelProps} />
		</div>
	)
}
