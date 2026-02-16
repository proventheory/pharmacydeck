import type { ComponentType } from "react";

export interface NavLinkProps {
  href: string;
  className?: string;
  children: React.ReactNode;
}

export interface NavProps {
  Link?: ComponentType<NavLinkProps>;
}

const DefaultLink = ({ href, className, children }: NavLinkProps) => (
  <a href={href} className={className}>
    {children}
  </a>
);

export function Nav({ Link: LinkComponent = DefaultLink }: NavProps = {}) {
  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <LinkComponent href="/" className="text-lg font-bold text-gray-900">
          PharmacyDeck
        </LinkComponent>
        <ul className="flex gap-5 text-sm">
          <li>
            <LinkComponent href="/" className="text-gray-600 hover:text-gray-900">
              Search
            </LinkComponent>
          </li>
          <li>
            <LinkComponent href="/compare" className="text-gray-600 hover:text-gray-900">
              Compare
            </LinkComponent>
          </li>
          <li>
            <LinkComponent href="/deck" className="text-gray-600 hover:text-gray-900">
              My Deck
            </LinkComponent>
          </li>
          <li>
            <LinkComponent href="/cyberdeck" className="text-gray-600 hover:text-gray-900">
              Cyberdeck
            </LinkComponent>
          </li>
        </ul>
      </div>
    </nav>
  );
}
