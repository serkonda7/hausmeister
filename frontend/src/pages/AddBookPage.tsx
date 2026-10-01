import { AddBookPanel, type AddBookPanelProps } from '../components/AddBookPanel'
import { t } from '../i18n'
import { PAGE_PATHS } from '../routes'

export type AddBookPageProps = AddBookPanelProps & {
	onNavigate: (path: string, event: MouseEvent) => void
}

export function AddBookPage(props: AddBookPageProps) {
	return (
		<div class="add-book-page">
			<nav class="breadcrumb" aria-label={t('nav.breadcrumb')}>
				<a href={PAGE_PATHS.library} onClick={(e) => props.onNavigate(PAGE_PATHS.library, e)}>
					{t('nav.library')}
				</a>
				<span class="breadcrumb-separator" aria-hidden="true">
					/
				</span>
				<span class="breadcrumb-current" aria-current="page">
					{t('library.addBook')}
				</span>
			</nav>

			<AddBookPanel {...props} />
		</div>
	)
}
