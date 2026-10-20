import { useCallback, useEffect, useState } from "react";

/**
 * The studio's pages and their addresses:
 *   /                     New video
 *   /projects/:id         a project
 *   /channels/:id         a channel's settings
 *   /marketing            a new marketing video
 *   /marketing/:session   a marketing chat
 *   /marketing/clients/:id  a client's Instagram ideas and posts
 *   /marketing/promos     website promos (a site scrolling on a laptop and a phone)
 *   /marketing/promos/:id one promo
 */
export type Route = { page: "new" } | { page: "project"; id: string } | { page: "channel"; id: string } | { page: "marketing"; session: string | null } | { page: "client"; id: string } | { page: "promos"; id: string | null };

const ID = "([a-z0-9-]+)";

export function parseRoute(pathname: string, search: string): Route {
  // Links from before the paths existed: ?project=…, ?channel=…, ?marketing=….
  const query = new URLSearchParams(search);
  if (query.get("project")) return { page: "project", id: query.get("project")! };
  if (query.get("channel")) return { page: "channel", id: query.get("channel")! };
  if (query.get("marketing")) return { page: "marketing", session: query.get("marketing") === "new" ? null : query.get("marketing") };

  let match: RegExpMatchArray | null;
  if ((match = pathname.match(new RegExp(`^/projects/${ID}/?$`)))) return { page: "project", id: match[1] };
  if ((match = pathname.match(new RegExp(`^/channels/${ID}/?$`)))) return { page: "channel", id: match[1] };
  if ((match = pathname.match(new RegExp(`^/marketing/clients/${ID}/?$`)))) return { page: "client", id: match[1] };
  if ((match = pathname.match(new RegExp(`^/marketing/promos/${ID}/?$`)))) return { page: "promos", id: match[1] };
  if (/^\/marketing\/promos\/?$/.test(pathname)) return { page: "promos", id: null };
  if ((match = pathname.match(new RegExp(`^/marketing/${ID}/?$`)))) return { page: "marketing", session: match[1] };
  if (/^\/marketing\/?$/.test(pathname)) return { page: "marketing", session: null };
  return { page: "new" };
}

export function routePath(route: Route): string {
  switch (route.page) {
    case "project":
      return `/projects/${route.id}`;
    case "channel":
      return `/channels/${route.id}`;
    case "marketing":
      return route.session ? `/marketing/${route.session}` : "/marketing";
    case "client":
      return `/marketing/clients/${route.id}`;
    case "promos":
      return route.id ? `/marketing/promos/${route.id}` : "/marketing/promos";
    default:
      return "/";
  }
}

/** The current page and a way to go to another; the browser's back and forward buttons move between them. */
export function useRoute(): [Route, (route: Route, options?: { replace?: boolean }) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.pathname, location.search));

  // An old ?query link is rewritten to its path once.
  useEffect(() => {
    const path = routePath(route);
    if (location.search || location.pathname !== path) history.replaceState(null, "", path);
    const back = () => setRoute(parseRoute(location.pathname, location.search));
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  const navigate = useCallback((next: Route, options: { replace?: boolean } = {}) => {
    const path = routePath(next);
    if (path !== location.pathname) history[options.replace ? "replaceState" : "pushState"](null, "", path);
    setRoute(next);
  }, []);

  return [route, navigate];
}
