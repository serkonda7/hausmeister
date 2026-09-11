import { type JSX, type Setter, Show } from 'solid-js'
import type { Account, Category } from '../lib/api'
import { todayISO } from '../lib/format'
import { t } from '../lib/i18n'
import {
	AccountSelect,
	CategorySelect,
	NotesInput,
	PayeeInput,
	TxnAmountInput,
	TxnDateField,
} from './TransactionFields'

export interface TransferForm {
	fromAccountId: string
	toAccountId: string
	amount: string
	date: string
	payee: string
	categoryId: string
	notes: string
}

export function emptyTransferForm(fromAccountId = '', toAccountId = ''): TransferForm {
	return {
		fromAccountId,
		toAccountId,
		amount: '',
		date: todayISO(),
		payee: '',
		categoryId: '',
		notes: '',
	}
}

/** Live client-side hint condition: source == destination (non-empty). Pure. */
export function isSameAccountTransfer(f: TransferForm): boolean {
	return f.fromAccountId !== '' && f.fromAccountId === f.toAccountId
}

interface TransferFormFieldsProps {
	form: () => TransferForm
	setForm: Setter<TransferForm>
	accounts: () => Account[] | undefined
	categories: () => Category[] | undefined
}

function patch<K extends keyof TransferForm>(
	setForm: Setter<TransferForm>,
	key: K,
	value: TransferForm[K],
): void {
	setForm((prev) => ({ ...prev, [key]: value }))
}

/** Transfer field group. Rendered inside the shared `CrudForm` shell. */
export default function TransferFormFields(props: TransferFormFieldsProps): JSX.Element {
	const form = props.form
	const sameAccount = () => isSameAccountTransfer(form())
	return (
		<div class="txn-subform">
			<div class="form-grid">
				<AccountSelect
					label={t().transactions.fromAccount}
					value={form().fromAccountId}
					onChange={(v) => patch(props.setForm, 'fromAccountId', v)}
					accounts={props.accounts}
					required
				/>
				<AccountSelect
					label={t().transactions.toAccount}
					value={form().toAccountId}
					onChange={(v) => patch(props.setForm, 'toAccountId', v)}
					accounts={props.accounts}
					required
					describedBy="transfer-accounts-hint"
				/>
				<TxnAmountInput
					value={form().amount}
					onInput={(v) => patch(props.setForm, 'amount', v)}
					required
				/>
				<TxnDateField
					id="transfer-date"
					value={form().date}
					onInput={(v) => patch(props.setForm, 'date', v)}
					required
				/>
				<PayeeInput
					label={t().transactions.payeeOptional}
					value={form().payee}
					onInput={(v) => patch(props.setForm, 'payee', v)}
				/>
				<CategorySelect
					label={t().transactions.categoryOptional}
					value={form().categoryId}
					onChange={(v) => patch(props.setForm, 'categoryId', v)}
					categories={props.categories}
				/>
			</div>
			<Show when={sameAccount()}>
				<p id="transfer-accounts-hint" class="form-hint form-hint--error">
					{t().transactions.sameAccountHint}
				</p>
			</Show>
			<NotesInput value={form().notes} onInput={(v) => patch(props.setForm, 'notes', v)} />
			<p class="muted text-sm">{t().transactions.transferExplainer}</p>
		</div>
	)
}
