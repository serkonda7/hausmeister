import { For, type JSX, Show } from 'solid-js'
import { api, type Category } from '../lib/api'
import { removeWithConfirm, useCrudForm } from '../lib/crud'
import { patchForm } from '../lib/form'
import { t } from '../lib/i18n'
import CrudForm from './CrudForm'
import Dot from './Dot'
import EmptyState from './EmptyState'
import EntityCard from './EntityCard'
import PageHeader from './PageHeader'

interface CategoriesSectionProps {
	categories: () => Category[] | undefined
	loading: boolean
	onChanged: () => void
}

interface CatForm {
	name: string
	kind: string
	color: string
}

const EMPTY_CAT: CatForm = { name: '', kind: '', color: '#22c55e' }

const CATEGORY_KIND_KEYS: Record<string, string> = {
	income: 'incomeKind',
	expense: 'expenseKind',
}

function categoryKindLabel(kind: string | null | undefined): string {
	const d = t().transactions as Record<string, string>
	return d[CATEGORY_KIND_KEYS[kind ?? ''] ?? 'both'] ?? d.both
}

/** Categories manager: header + `CrudForm` + list. Self-contained CRUD. */
export default function CategoriesSection(props: CategoriesSectionProps): JSX.Element {
	const crud = useCrudForm<CatForm, Category>({ ...EMPTY_CAT })
	const form = crud.form

	function openCreate() {
		crud.openCreate({ ...EMPTY_CAT })
	}

	function openEdit(c: Category) {
		crud.openEdit(c, { name: c.name, kind: c.kind ?? '', color: c.color ?? '#22c55e' })
	}

	function submit(e: Event) {
		return crud.submit(e, async () => {
			const f = form()
			if (!f.name.trim()) {
				throw new Error(t().transactions.nameRequired)
			}
			const payload = {
				name: f.name.trim(),
				kind: (f.kind || null) as Category['kind'],
				color: f.color || null,
			}
			const cur = crud.editing()
			if (cur) {
				await api.categories.update(cur.id, payload)
			} else {
				await api.categories.create(payload)
			}
			await props.onChanged()
		})
	}

	function remove(id: string) {
		return removeWithConfirm(
			t().transactions.deleteCategoryConfirm,
			() => api.categories.remove(id),
			props.onChanged,
		)
	}

	return (
		<>
			<PageHeader
				style={{ 'margin-top': '1rem' }}
				title={t().transactions.categoriesTitle}
				actions={
					<button type="button" onClick={openCreate} class="btn-ghost">
						{t().transactions.addCategory}
					</button>
				}
			/>

			<CrudForm
				open={crud.showForm()}
				error={crud.error()}
				editing={crud.editing()}
				onSubmit={submit}
				onCancel={crud.close}
			>
				<div class="form-grid">
					<label class="field">
						{t().transactions.nameField}
						<input
							value={form().name}
							onInput={(e) => patchForm(crud.setForm, 'name', e.currentTarget.value)}
							required
							class="input"
							placeholder={t().transactions.categoryPlaceholder}
						/>
					</label>
					<label class="field">
						{t().transactions.kind}
						<select
							value={form().kind}
							onChange={(e) => patchForm(crud.setForm, 'kind', e.currentTarget.value)}
							class="input"
						>
							<option value="">{t().transactions.both}</option>
							<option value="income">{t().transactions.incomeKind}</option>
							<option value="expense">{t().transactions.expenseKind}</option>
						</select>
					</label>
					<label class="field">
						{t().transactions.color}
						<input
							type="color"
							value={form().color}
							onInput={(e) => patchForm(crud.setForm, 'color', e.currentTarget.value)}
							class="color-swatch"
							aria-label={t().transactions.categoryColorLabel}
						/>
					</label>
				</div>
			</CrudForm>

			<div class="list list--tight">
				<For each={props.categories() ?? []}>
					{(c) => (
						<EntityCard
							title={
								<span class="inline-row">
									<Dot color={c.color} />
									<span class="strong">{c.name}</span>
									<span class="muted text-sm">· {categoryKindLabel(c.kind)}</span>
								</span>
							}
							onEdit={() => openEdit(c)}
							onDelete={() => remove(c.id)}
						/>
					)}
				</For>
				<Show when={(props.categories() ?? []).length === 0 && !props.loading}>
					<EmptyState actionLabel={t().transactions.addCategory} onAction={openCreate}>
						{t().transactions.emptyText}
					</EmptyState>
				</Show>
			</div>
		</>
	)
}
