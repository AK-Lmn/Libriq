export class Router {
  #routes = new Map();
  #currentRoute;
  #root;
  #beforeNavigate;
  #afterNavigate;
  #renderError;
  #cleanup = null;

  constructor({
    root,
    initialRoute = 'dashboard',
    beforeNavigate = () => {},
    afterNavigate = () => {},
    renderError = null,
  } = {}) {
    this.#root = root;
    this.#currentRoute = initialRoute;
    this.#beforeNavigate = beforeNavigate;
    this.#afterNavigate = afterNavigate;
    this.#renderError = renderError;
  }

  get currentRoute() {
    return this.#currentRoute;
  }

  register(name, render) {
    if (!name || typeof render !== 'function') {
      throw new TypeError('Router.register(name, render) requires a route name and render function.');
    }
    this.#routes.set(name, render);
    return this;
  }

  registerAll(routes) {
    Object.entries(routes || {}).forEach(([name, render]) => this.register(name, render));
    return this;
  }

  has(name) {
    return this.#routes.has(name);
  }

  navigate(name, context = {}) {
    if (!this.has(name)) return false;
    const previousRoute = this.#currentRoute;
    this.#currentRoute = name;
    this.#beforeNavigate({ name, previousRoute, root: this.#getRoot(), context });
    this.#render(name, context);
    this.#afterNavigate({ name, previousRoute, root: this.#getRoot(), context });
    return true;
  }

  refresh(context = {}) {
    if (!this.has(this.#currentRoute)) return false;
    this.#render(this.#currentRoute, { ...context, refresh: true });
    return true;
  }

  #getRoot() {
    return typeof this.#root === 'function' ? this.#root() : this.#root;
  }

  #render(name, context) {
    const root = this.#getRoot();
    this.#cleanup?.();
    this.#cleanup = null;
    if (root) root.replaceChildren?.();

    try {
      const result = this.#routes.get(name)({ name, root, router: this, ...context });
      if (result?.then) {
        result
          .then(cleanup => {
            if (this.#currentRoute === name && typeof cleanup === 'function') this.#cleanup = cleanup;
          })
          .catch(error => this.#handleError(error, name, root));
      } else if (typeof result === 'function') {
        this.#cleanup = result;
      }
    } catch (error) {
      this.#handleError(error, name, root);
    }
  }

  #handleError(error, name, root) {
    if (typeof this.#renderError === 'function') {
      this.#renderError({ error, name, root });
      return;
    }
    throw error;
  }
}
