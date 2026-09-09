import { render } from 'solid-js/web'
import App from './App'
import { initLocale } from './lib/i18n'
import { initTheme } from './lib/theme'
import './styles.css'

initTheme()
initLocale()

const root = document.getElementById('root')
if (!root) {
	throw new Error('Missing #root')
}
render(() => <App />, root)
