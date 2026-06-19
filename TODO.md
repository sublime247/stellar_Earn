# TODO

## Notifications email/in-app templates (typed + tests)

- [ ] Implement `BackEnd/src/modules/notifications/template/notification.interface.ts` with typed data contracts + shared render result types.
- [ ] Implement `quest-update.template.ts` using `EmailTemplateEngine` for HTML rendering.
- [ ] Implement `submission-status.template.ts` using `EmailTemplateEngine` for HTML rendering.
- [ ] Implement `system.template.ts` using `EmailTemplateEngine` for HTML rendering.
- [ ] Add unit tests for all templates in `BackEnd/test/notifications/templates/notification.templates.spec.ts`.
- [ ] Run backend unit tests for the new suite and fix any TypeScript/Jest issues.
- [x] Create git branch `blackboxai/404-improvements`
- [ ] Redesign `FrontEnd/my-app/app/not-found.tsx`:

- [ ] Add friendly 404 illustration
- [ ] Add at least 2 navigation options (Home, Quest listing)
- [ ] Add inline search bar that queries quest search API
- [ ] Ensure accessible heading hierarchy (single H1)
- [ ] Add analytics tracking for 404 hits (event name + payload)
- [ ] Wire search results to quest listing links
- [ ] Run frontend lint/tests/build (as available)

