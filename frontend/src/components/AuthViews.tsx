import { Show } from 'solid-js'

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
				<h2 id="setup-title">Welcome — create the admin user</h2>
				<p class="hint">
					First run: no users exist yet. Create the admin account. The admin can then create more
					users (username + password) under Users.
				</p>
				<form onSubmit={props.onSubmit}>
					<div class="form-grid">
						<label>
							<span>
								Username <em>*</em>
							</span>
							<input
								value={props.username}
								onInput={(e) => props.onUsername(e.currentTarget.value)}
								required
								autocomplete="username"
							/>
						</label>
						<label>
							<span>Display name (optional)</span>
							<input
								value={props.displayName}
								onInput={(e) => props.onDisplayName(e.currentTarget.value)}
								autocomplete="nickname"
								placeholder="e.g. Alex"
							/>
						</label>
						<label>
							<span>
								Password <em>*</em>
							</span>
							<input
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
							{props.busy ? 'Creating…' : 'Create admin'}
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
				<h2 id="login-title">Log in</h2>
				<p class="hint">Everyone can see all books, but you can only edit your own.</p>
				<form onSubmit={props.onSubmit}>
					<div class="form-grid">
						<label>
							<span>
								Username <em>*</em>
							</span>
							<input
								value={props.username}
								onInput={(e) => props.onUsername(e.currentTarget.value)}
								required
								autocomplete="username"
							/>
						</label>
						<label>
							<span>
								Password <em>*</em>
							</span>
							<input
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
							{props.busy ? 'Logging in…' : 'Log in'}
						</button>
					</div>
				</form>
			</section>
		</div>
	)
}
