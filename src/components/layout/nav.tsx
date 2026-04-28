"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const links = [
  { href: "#work", label: "Work" },
  { href: "#about", label: "About" },
  { href: "#contact", label: "Contact" },
];

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <nav className="flex w-full max-w-5xl items-center justify-between rounded-full border border-white/10 bg-background/40 px-5 py-2.5 backdrop-blur-xl">
        <Link
          href="/"
          className="font-display text-xl font-medium tracking-tight"
        >
          YA.
        </Link>

        <ul className="hidden items-center gap-7 text-sm text-foreground/70 md:flex">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              className="inline-flex h-10 w-10 items-center justify-center text-foreground/70 transition-colors hover:text-foreground md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="border-white/10 bg-background text-foreground"
          >
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <nav className="mt-20 flex flex-col gap-8 px-8">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="font-display text-4xl font-medium tracking-tight text-foreground/80 transition-colors hover:text-foreground"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  );
}
