import { data } from "react-router";
import type { Route } from "./+types/well-known";

export function loader(_: Route.LoaderArgs) {
  return data(null, { status: 404 });
}
