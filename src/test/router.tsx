import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router";
import { AppProviders } from "@/components/AppProviders";

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

// Any navigation away from `path` lands on the probe, so tests assert the
// destination via `findByTestId('location')`. A data router, like the app's,
// so pages can use `useBlocker`. Wrapped in the app providers, so toasts and
// tooltips render as they do under the layout.
export function renderWithRouter(
  ui: ReactElement,
  { path = "/", route = "/" }: { path?: string; route?: string } = {},
) {
  const router = createMemoryRouter(
    [
      { path, element: ui },
      { path: "*", element: <LocationProbe /> },
    ],
    { initialEntries: [route] },
  );
  return render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

export function routerWrapper(route = "/") {
  return function RouterWrapper({ children }: { children: ReactNode }) {
    return (
      <AppProviders>
        <MemoryRouter initialEntries={[route]}>
          {children}
          <LocationProbe />
        </MemoryRouter>
      </AppProviders>
    );
  };
}
