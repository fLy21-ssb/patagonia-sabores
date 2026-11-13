import { render } from 'preact';
import '@fontsource/alfa-slab-one/latin-400.css';
import '@fontsource-variable/josefin-sans/wght.css';
import '@fontsource-variable/nunito/wght.css';
import '../styles/base.css';
import '../styles/admin.css';
import { App } from './App.jsx';
import { registrarSW } from '../shared/pwa.js';

render(<App />, document.getElementById('app'));
registrarSW();
