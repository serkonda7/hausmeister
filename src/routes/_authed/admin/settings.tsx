import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { createFileRoute } from '@tanstack/solid-router'
import { For } from 'solid-js'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input, inputClass } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { settingsQuery } from '~/lib/admin-queries'
import { guardSection } from '~/lib/admin-sections'
import { runAction } from '~/lib/run-action'
import { m } from '~/paraglide/messages'
import { updateSettingsFn } from '~/server/settings/functions'

export const Route = createFileRoute('/_authed/admin/settings')({
	beforeLoad: ({ context }) => guardSection(context.user.role, '/admin/settings'),
	loader: ({ context }) => context.queryClient.ensureQueryData(settingsQuery()),
	head: () => ({ meta: [{ title: `${m.admin_nav_settings()} · ${m.app_name()}` }] }),
	component: SettingsPage,
})

// Kept in sync with CURRENCIES in src/server/settings/service.ts. The server
// validates the submitted value; this list only drives the options.
const CURRENCIES = ['EUR', 'CHF', 'USD', 'GBP'] as const

function SettingsPage() {
	const qc = useQueryClient()
	const settings = useQuery(() => settingsQuery())

	async function onSave(e: SubmitEvent) {
		e.preventDefault()
		const data = new FormData(e.currentTarget as HTMLFormElement)
		const result = await runAction(
			() =>
				updateSettingsFn({
					data: {
						householdName: String(data.get('householdName') ?? ''),
						currency: String(data.get('currency') ?? ''),
					},
				}),
			{ success: m.admin_settings_saved() },
		)
		if (result) await qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<h2>{m.admin_nav_settings()}</h2>
				</CardTitle>
				<CardDescription>{m.admin_settings_intro()}</CardDescription>
			</CardHeader>
			<CardContent>
				<form class="grid max-w-md gap-4" onSubmit={onSave}>
					<div class="grid gap-2">
						<Label for="settings-name">{m.admin_settings_household_name()}</Label>
						<Input
							id="settings-name"
							name="householdName"
							maxLength={80}
							required
							value={settings.data?.householdName ?? ''}
						/>
					</div>
					<div class="grid gap-2">
						<Label for="settings-currency">{m.admin_settings_currency()}</Label>
						<select
							id="settings-currency"
							name="currency"
							class={inputClass}
							value={settings.data?.currency ?? 'EUR'}
						>
							<For each={CURRENCIES}>
								{(code) => <option value={code}>{code}</option>}
							</For>
						</select>
					</div>
					<div>
						<Button type="submit">{m.common_save()}</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	)
}
