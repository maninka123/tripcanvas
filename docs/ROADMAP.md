# Roadmap

What is deliberately not done yet, roughly in priority order.

## Next

- **Purge job for deleted trips' files** — delete R2 objects when a trip is permanently purged (Workers Cron).
- **Malware scanning** — connect a scanning service to the `FileScanner` hook and block downloads of `infected` files.
- **Opening hours** — show verified hours from a provider that has them, and add the "outside opening hours" check (the checker is ready for the data).
- **Live collaboration** — the versioned model already prevents lost updates; add push updates (Durable Objects/WebSockets) instead of focus/interval refresh.
- **Comments and voting** on plans, and shared expenses between travellers.
- **Offline planner** — today only Travel Mode is cached; queue edits made fully offline across app restarts.

## Later

- Import bookings from confirmation emails and PDFs.
- Public read-only share links.
- Transit routing where a provider covers it.
- Dark mode (tokens are ready).
- Post-trip journal and photos.
