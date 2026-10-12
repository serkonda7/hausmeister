import { PASSWORD_MIN_LENGTH } from 'shared/src/book'
import { createSignal, Show } from 'solid-js'
import { api, errorMessage } from '../api'
import type { Credentials } from '../hooks/useAuth'
import { t } from '../i18n'
import { ErrorText, LoadingRows, SubmitButton, TextField } from './common'
import { Dialog } from './Dialog'
import { LanguageSelect } from './Layout'

export function AuthLoading() {
	return <LoadingRows count={2} />
}

export type AuthPageProps = {
	/** `setup` creates the first (admin) user; `login` signs in. */
	mode: 'setup' | 'login'
	busy: boolean
	error: string | null
	onSubmit: (credentials: Credentials) => void
}

/** Full-screen sign-in page, shown instead of the app layout while logged out. */
export function AuthPage(props: AuthPageProps) {
	const [username, setUsername] = createSignal('')
	const [displayName, setDisplayName] = createSignal('')
	const [password, setPassword] = createSignal('')
	const isSetup = () => props.mode === 'setup'

	function submit(e: Event): void {
		e.preventDefault()
		props.onSubmit({ username: username(), password: password(), displayName: displayName() })
	}

	return (
		<main class="auth-page">
			<div class="auth-brand">Hausmeister</div>
			<section class="auth-card panel" aria-labelledby="auth-heading">
				<h1 id="auth-heading">{isSetup() ? t('auth.setupTitle') : t('auth.loginTitle')}</h1>
				<form onSubmit={submit}>
					<div class="auth-fields">
						<TextField
							id={`${props.mode}-username`}
							label={t('auth.username')}
							value={username()}
							onInput={setUsername}
							required
							autofocus
							autocomplete="username"
						/>
						<Show when={isSetup()}>
							<TextField
								id="setup-display-name"
								label={t('auth.displayNameOptional')}
								value={displayName()}
								onInput={setDisplayName}
								autocomplete="nickname"
								placeholder={t('auth.displayNamePlaceholder')}
							/>
						</Show>
						<TextField
							id={`${props.mode}-password`}
							label={t('auth.password')}
							type="password"
							value={password()}
							onInput={setPassword}
							required
							minlength={isSetup() ? PASSWORD_MIN_LENGTH : undefined}
							autocomplete={isSetup() ? 'new-password' : 'current-password'}
						/>
					</div>
					<ErrorText message={props.error} />
					<SubmitButton
						busy={props.busy}
						busyLabel={isSetup() ? t('common.creating') : t('auth.loginBusy')}
					>
						{isSetup() ? t('auth.setupSubmit') : t('auth.loginSubmit')}
					</SubmitButton>
				</form>
			</section>
			<div class="auth-footer">
				<LanguageSelect />
			</div>
		</main>
	)
}

/** Change the logged-in user's own password; other sessions get logged out. */
export function ChangePasswordDialog(props: { onClose: () => void }) {
	const [currentPassword, setCurrentPassword] = createSignal('')
	const [newPassword, setNewPassword] = createSignal('')
	const [busy, setBusy] = createSignal(false)
	const [error, setError] = createSignal<string | null>(null)

	async function submit(e: Event): Promise<void> {
		e.preventDefault()
		setError(null)
		setBusy(true)
		try {
			const body = { currentPassword: currentPassword(), newPassword: newPassword() }
			await api('/auth/password', { method: 'POST', body })
			props.onClose()
		} catch (err) {
			setError(errorMessage(err, 'auth.changePasswordFailed'))
		} finally {
			setBusy(false)
		}
	}

	return (
		<Dialog
			id="change-password"
			title={t('auth.changePassword')}
			hint={t('auth.changePasswordHint')}
			closeLabel={t('auth.changePasswordClose')}
			onClose={() => !busy() && props.onClose()}
			isDirty={() => currentPassword() !== '' || newPassword() !== ''}
		>
			<form onSubmit={(e) => void submit(e)}>
				<div class="form-grid">
					<TextField
						id="change-password-current"
						label={t('auth.currentPassword')}
						type="password"
						value={currentPassword()}
						onInput={setCurrentPassword}
						required
						autocomplete="current-password"
					/>
					<TextField
						id="change-password-new"
						label={t('auth.newPassword')}
						type="password"
						value={newPassword()}
						onInput={setNewPassword}
						required
						minlength={PASSWORD_MIN_LENGTH}
						autocomplete="new-password"
					/>
				</div>
				<ErrorText message={error()} />
				<div class="form-actions">
					<button type="button" class="ghost" onClick={props.onClose} disabled={busy()}>
						{t('common.cancel')}
					</button>
					<SubmitButton busy={busy()} busyLabel={t('common.saving')}>
						{t('auth.changePassword')}
					</SubmitButton>
				</div>
			</form>
		</Dialog>
	)
}
