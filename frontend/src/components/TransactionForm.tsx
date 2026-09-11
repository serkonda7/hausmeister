import type { JSX, Setter } from 'solid-js'
import type { Account, Category } from '../lib/api'
import { todayISO } from '../lib/format'
import { t } from '../lib/i18n'
import { SelectField } from './Field'
import {
	AccountSelect,
	CategorySelect,
	NotesInput,
	PayeeInput,
	TxnAmountInput,
	TxnDateField,
} from './TransactionFields'

export interface TxnForm {
	accountId: string
	date: string
	payee: string
	categoryId: string
	amount: string
	direction: 'inflow' | 'outflow'
	notes: string
}

export function emptyTxnForm(accountId = ''): TxnForm {
	return {
		accountId,
		date: todayISO(),
		payee: '',
		categoryId: '',
		amount: '',
		direction: 'outflow',
		notes: '',
	}
}

interface TransactionFormFieldsProps {
	form: () => TxnForm
	setForm: Setter<TxnForm>
	accounts: () => Account[] | undefined
	categories: () => Category[] | undefined
}

function patch<K extends keyof TxnForm>(setForm: Setter<TxnForm>, key: K, value: TxnForm[K]): void {
	setForm((prev) => ({ ...prev, [key]: value }))
}

/** Transaction (non-transfer) field group. Rendered inside the shared `CrudForm` shell. */
export default function TransactionFormFields(props: TransactionFormFieldsProps): JSX.Element {
	const form = props.form
	return (
		<div class="txn-subform">
			<div class="form-grid">
				<AccountSelect
					label={t().transactions.account}
					value={form().accountId}
					onChange={(v) => patch(props.setForm, 'accountId', v)}
					accounts={props.accounts}
					required
				/>
				<TxnDateField
					id="txn-date"
					value={form().date}
					onInput={(v) => patch(props.setForm, 'date', v)}
					required
				/>
				<PayeeInput
					label={t().transactions.payee}
					value={form().payee}
					onInput={(v) => patch(props.setForm, 'payee', v)}
					placeholder={t().transactions.payeePlaceholder}
				/>
				<CategorySelect
					label={t().transactions.category}
					value={form().categoryId}
					onChange={(v) => patch(props.setForm, 'categoryId', v)}
					categories={props.categories}
				/>
				<TxnAmountInput
					value={form().amount}
					onInput={(v) => patch(props.setForm, 'amount', v)}
					required
				/>
				<SelectField
					label={t().transactions.direction}
					value={form().direction}
					onChange={(v) => patch(props.setForm, 'direction', v as TxnForm['direction'])}
				>
					<option value="inflow">{t().transactions.inflow}</option>
					<option value="outflow">{t().transactions.outflow}</option>
				</SelectField>
			</div>
			<NotesInput value={form().notes} onInput={(v) => patch(props.setForm, 'notes', v)} />
		</div>
	)
}
