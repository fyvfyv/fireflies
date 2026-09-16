import { tw } from "@tw";
import type { RouteObject } from "react-router";
import { BackLink } from "@/components/BackLink";
import { Layout } from "@/components/Layout";
import { HomePage } from "@/pages/HomePage";
import { MeetingPage } from "@/pages/MeetingPage";

function NotFoundPage() {
  return (
    <div className={tw("space-y-3")}>
      <BackLink />
      <h1 className={tw("text-title font-semibold")}>Page not found</h1>
    </div>
  );
}

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/m/:id", element: <MeetingPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
