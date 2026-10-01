import { t } from '../i18n'
import type { Book } from '../types'
import { formatRecordDate } from '../utils/books'

export function ReadCheckbox(props: {
	book: Book
	pending: boolean
	onToggle: (book: Book) => void
}) {
	const readAt = () => props.book.readAt
	return (
		<input
			type="checkbox"
			class="read-checkbox"
			checked={readAt() !== null}
			disabled={props.pending}
			onChange={() => props.onToggle(props.book)}
			aria-label={t('reading.markAria', { title: props.book.title })}
			title={
				readAt() === null ? undefined : t('reading.readOn', { date: formatRecordDate(readAt()) })
			}
		/>
	)
}
