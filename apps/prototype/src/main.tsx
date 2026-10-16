import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/base.css';
import './styles/ui.css';
import './styles/shell.css';
import './styles/web.css';
import './styles/mobile.css';
import './styles/admin.css';
import './styles/doc.css';
import './styles/brand.css';
import './styles/tech.css';

const container = document.getElementById('root');
if (container) createRoot(container).render(<App />);
