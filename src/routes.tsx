import { tw } from "@tw";
import { ArrowLeft, FileQuestionMark } from "lucide-react";
import { Link, type RouteObject } from "react-router";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/Button";
import { useDocumentTitle } from "@/components/useDocumentTitle";
import { HomePage } from "@/pages/HomePage";
import { MeetingPage } from "@/pages/MeetingPage";

function NotFoundPage() {
  useDocumentTitle("Page not found – Recap");
  return (
    <div
      className={tw(
        "mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center md:py-28",
      )}
    >
      <div
        className={tw(
          "mb-5 grid size-12 place-items-center rounded-full bg-sunken text-graphite",
        )}
      >
        <FileQuestionMark aria-hidden="true" size={22} />
      </div>
      <h1 className={tw("type-title")}>Page not found</h1>
      <p className={tw("mt-2 text-body text-graphite")}>
        The link may be broken, or the page was moved.
      </p>
      <Button asChild variant="secondary" className={tw("mt-6")}>
        <Link to="/">
          <ArrowLeft aria-hidden="true" />
          Back to meetings
        </Link>
      </Button>
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
