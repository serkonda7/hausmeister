import { AddBookPanel, type AddBookPanelProps } from '../components/AddBookPanel'

export type AddBookPageProps = {
	addPanelProps: AddBookPanelProps
	onNavigate: (path: string, event: MouseEvent) => void
}

export function AddBookPage(props: AddBookPageProps) {
	return (
		<div class="add-book-page">
			<nav class="breadcrumb" aria-label="Breadcrumb">
				<a href="/library" onClick={(e) => props.onNavigate('/library', e)}>
					Library
				</a>
				<span class="breadcrumb-separator" aria-hidden="true">
					/
				</span>
				<span class="breadcrumb-current" aria-current="page">
					Add book
				</span>
			</nav>

			<AddBookPanel {...props.addPanelProps} />
		</div>
	)
}
