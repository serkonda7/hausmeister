import { For, type JSX } from 'solid-js'
import type { Account, Category } from '../lib/api'
import { t } from '../lib/i18n'
import DateInput from './DateInput'
import { SelectField, TextField } from './Field'

/**
 * Field fragments shared by the transaction and transfer subforms
 * (`TransactionForm.tsx` / `TransferForm.tsx`): account selects,
 * payee/category/notes/date/amount inputs. One place instead of two
 * near-identical copies.
 */

interface AccountSelectProps {
	label: JSX.Element
	value: string
	onChange: (value: string) => void
	accounts: () => Account[] | undefined
	required?: boolean
	describedBy?: string
}

export function AccountSelect(props: AccountSelectProps): JSX.Element {
	return (
		<SelectField
			label={props.label}
			required={props.required}
			value={props.value}
			onChange={props.onChange}
			ariaDescribedBy={props.describedBy}
		>
			<option value="">{t().common.select}</option>
			<For each={props.accounts() ?? []}>{(a) => <option value={a.id}>{a.name}</option>}</For>
		</SelectField>
	)
}

interface CategorySelectProps {
	label: JSX.Element
	value: string
	onChange: (value: string) => void
	categories: () => Category[] | undefined
}

export function CategorySelect(props: CategorySelectProps): JSX.Element {
	return (
		<SelectField label={props.label} value={props.value} onChange={props.onChange}>
			<option value="">{t().common.none}</option>
			<For each={props.categories() ?? []}>
				{(c) => <option value={c.id}>{c.name}</option>}
			</For>
		</SelectField>
	)
}

interface PayeeInputProps {
	label: JSX.Element
	value: string
	onInput: (value: string) => void
	placeholder?: string
}

export function PayeeInput(props: PayeeInputProps): JSX.Element {
	return (
		<TextField
			label={props.label}
			value={props.value}
			onInput={props.onInput}
			placeholder={props.placeholder}
		/>
	)
}

interface NotesInputProps {
	value: string
	onInput: (value: string) => void
}

export function NotesInput(props: NotesInputProps): JSX.Element {
	return (
		<TextField
			label={t().transactions.notesField}
			value={props.value}
			onInput={props.onInput}
		/>
	)
}

interface DateFieldProps {
	id: string
	value: string
	onInput: (value: string) => void
	required?: boolean
}

export function TxnDateField(props: DateFieldProps): JSX.Element {
	return (
		<label class="field" for={props.id}>
			{t().transactions.date}
			<DateInput
				id={props.id}
				value={props.value}
				onInput={props.onInput}
				required={props.required}
			/>
		</label>
	)
}

interface AmountInputProps {
	value: string
	onInput: (value: string) => void
	required?: boolean
}

export function TxnAmountInput(props: AmountInputProps): JSX.Element {
	return (
		<TextField
			label={t().transactions.amount}
			type="number"
			step="0.01"
			min="0.01"
			value={props.value}
			onInput={props.onInput}
			required={props.required}
		/>
	)
}
