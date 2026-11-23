// Imported first by appModules.js, so the listeners are in place before the
// rest of the app's modules run.
import { installErrorReporting } from './errorReporting.js';
import { APP_VERSION } from '../version.js';

installErrorReporting({ release: APP_VERSION });
