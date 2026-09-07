import { IconPencil, IconTrash } from '@tabler/icons-solidjs'
import type { JSX } from 'solid-js'

interface CrudRowProps {
	onEdit: () => void
	onDelete: () => void
	editLabel?: string
	deleteLabel?: string
}

export default function CrudRow(props: CrudRowProps): JSX.Element {
	return (
		<>
			<button
				type="button"
				onClick={props.onEdit}
				class="btn-icon"
				aria-label={props.editLabel ?? 'Edit'}
				title={props.editLabel ?? 'Edit'}
			>
				<IconPencil size={18} />
			</button>
			<button
				type="button"
				onClick={props.onDelete}
				class="btn-icon btn-icon--danger"
				aria-label={props.deleteLabel ?? 'Delete'}
				title={props.deleteLabel ?? 'Delete'}
			>
				<IconTrash size={18} />
			</button>
		</>
	)
}
