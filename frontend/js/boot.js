// Picks how the app's JavaScript loads.
//
// Deployed builds load js/app.bundle.js: every module in one minified file,
// made by `npm run build`. Loading ~70 source modules one import at a time
// took several round trips on mobile before the app could start.
//
// Local runs and the browser tests load the source modules instead, so tests
// can stub a module by importing it. Add ?libriq_bundle=1 to try the bundle
// locally, or ?libriq_bundle=0 to load the sources on a deployed build.
const choice = new URLSearchParams(location.search).get('libriq_bundle');
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const useBundle = choice === '1' || (choice !== '0' && !local);

await import(useBundle ? './app.bundle.js' : './appModules.js');
