import { createSignal, Show } from 'solid-js'
import type { Credentials } from '../hooks/useAuth'
import { t } from '../i18n'
import { ErrorText, LoadingRows, SubmitButton, TextField } from './common'
import { Dialog } from './Dialog'

export function AuthLoading() {
	return <LoadingRows count={2} />
}

export type AuthDialogProps = {
	/** `setup` creates the first (admin) user; `login` signs in. */
	mode: 'setup' | 'login'
	busy: boolean
	error: string | null
	onSubmit: (credentials: Credentials) => void
}

export function AuthDialog(props: AuthDialogProps) {
	const [username, setUsername] = createSignal('')
	const [displayName, setDisplayName] = createSignal('')
	const [password, setPassword] = createSignal('')
	const isSetup = () => props.mode === 'setup'

	function submit(e: Event): void {
		e.preventDefault()
		props.onSubmit({ username: username(), password: password(), displayName: displayName() })
	}

	return (
		<Dialog
			id={props.mode}
			title={isSetup() ? t('auth.setupTitle') : t('auth.loginTitle')}
			hint={isSetup() ? t('auth.setupHint') : t('auth.loginHint')}
		>
			<form onSubmit={submit}>
				<div class="form-grid">
					<TextField
						id={`${props.mode}-username`}
						label={t('auth.username')}
						value={username()}
						onInput={setUsername}
						required
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
						autocomplete={isSetup() ? 'new-password' : 'current-password'}
					/>
				</div>
				<ErrorText message={props.error} />
				<div class="form-actions">
					<SubmitButton
						busy={props.busy}
						busyLabel={isSetup() ? t('common.creating') : t('auth.loginBusy')}
					>
						{isSetup() ? t('auth.setupSubmit') : t('auth.loginSubmit')}
					</SubmitButton>
				</div>
			</form>
		</Dialog>
	)
}
