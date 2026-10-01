import { Show } from 'solid-js'
import { t } from '../i18n'
import { ClearableInput } from './ClearableInput'

export function AuthLoading() {
	return (
		<div class="table-wrap">
			<div class="skeleton skeleton-row" />
			<div class="skeleton skeleton-row" />
		</div>
	)
}

export type SetupDialogProps = {
	username: string
	onUsername: (v: string) => void
	displayName: string
	onDisplayName: (v: string) => void
	password: string
	onPassword: (v: string) => void
	busy: boolean
	error: string | null
	onSubmit: (e: Event) => void
}

export function SetupDialog(props: SetupDialogProps) {
	return (
		<div class="dialog-backdrop" role="presentation">
			<section class="dialog panel" role="dialog" aria-modal="true" aria-labelledby="setup-title">
				<h2 id="setup-title">{t('auth.setupTitle')}</h2>
				<p class="hint">{t('auth.setupHint')}</p>
				<form onSubmit={props.onSubmit}>
					<div class="form-grid">
						<label for="setup-username">
							<span>
								{t('auth.username')} <em>*</em>
							</span>
							<ClearableInput
								id="setup-username"
								value={props.username}
								onInput={(e) => props.onUsername(e.currentTarget.value)}
								required
								autocomplete="username"
							/>
						</label>
						<label for="setup-display-name">
							<span>{t('auth.displayNameOptional')}</span>
							<ClearableInput
								id="setup-display-name"
								value={props.displayName}
								onInput={(e) => props.onDisplayName(e.currentTarget.value)}
								autocomplete="nickname"
								placeholder={t('auth.displayNamePlaceholder')}
							/>
						</label>
						<label for="setup-password">
							<span>
								{t('auth.password')} <em>*</em>
							</span>
							<ClearableInput
								id="setup-password"
								type="password"
								value={props.password}
								onInput={(e) => props.onPassword(e.currentTarget.value)}
								required
								autocomplete="new-password"
							/>
						</label>
					</div>
					<Show when={props.error}>
						<p class="error">{props.error}</p>
					</Show>
					<div class="form-actions">
						<button type="submit" class="primary" disabled={props.busy}>
							{props.busy ? t('common.creating') : t('auth.setupSubmit')}
						</button>
					</div>
				</form>
			</section>
		</div>
	)
}

export type LoginDialogProps = {
	username: string
	onUsername: (v: string) => void
	password: string
	onPassword: (v: string) => void
	busy: boolean
	error: string | null
	onSubmit: (e: Event) => void
}

export function LoginDialog(props: LoginDialogProps) {
	return (
		<div class="dialog-backdrop" role="presentation">
			<section class="dialog panel" role="dialog" aria-modal="true" aria-labelledby="login-title">
				<h2 id="login-title">{t('auth.loginTitle')}</h2>
				<p class="hint">{t('auth.loginHint')}</p>
				<form onSubmit={props.onSubmit}>
					<div class="form-grid">
						<label for="login-username">
							<span>
								{t('auth.username')} <em>*</em>
							</span>
							<ClearableInput
								id="login-username"
								value={props.username}
								onInput={(e) => props.onUsername(e.currentTarget.value)}
								required
								autocomplete="username"
							/>
						</label>
						<label for="login-password">
							<span>
								{t('auth.password')} <em>*</em>
							</span>
							<ClearableInput
								id="login-password"
								type="password"
								value={props.password}
								onInput={(e) => props.onPassword(e.currentTarget.value)}
								required
								autocomplete="current-password"
							/>
						</label>
					</div>
					<Show when={props.error}>
						<p class="error">{props.error}</p>
					</Show>
					<div class="form-actions">
						<button type="submit" class="primary" disabled={props.busy}>
							{props.busy ? t('auth.loginBusy') : t('auth.loginSubmit')}
						</button>
					</div>
				</form>
			</section>
		</div>
	)
}
