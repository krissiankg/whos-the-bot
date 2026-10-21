import type { ComponentPropsWithoutRef } from "react";

type HomeLinkProps = Omit<ComponentPropsWithoutRef<"a">, "href" | "onClick" | "target">;

// Home is also a stateful game screen: a document navigation resets it and
// removes room/developer query parameters without relying on the client router.
export function HomeLink(props: HomeLinkProps) {
  return <a {...props} href="/" />;
}
